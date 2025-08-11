const mongoose = require("mongoose");
const User = require("../models/User");
const Artwork = require("../models/Artwork");
const ArtistProfile = require("../models/ArtistProfile");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// Get complete user/owner profile (artists OR artwork owners)
const getCompleteArtistProfile = async (req, res, next) => {
  try {
    const { id: userId } = req.params;
    const currentUserId = req.user ? req.user.id : null;

    // Get user info (artist OR owner of artworks)
    const user = await User.findOne({
      _id: userId,
      isVerified: true,
      // ✅ REMOVED: role restriction - allow both artists and buyers who own artworks
    })
      .select("username profile engagementStats createdAt lastActive role")
      .lean();

    if (!user) {
      return next(new AppError("User not found", 404));
    }

    // Check if user has public profile rights
    const canHavePublicProfile = await checkPublicProfileEligibility(
      userId,
      user.role
    );

    if (!canHavePublicProfile) {
      return next(
        new AppError("This user does not have a public profile", 404)
      );
    }

    // ✅ Step 2: Get user profile details (works for both artists and owners)
    let userProfile = null;
    if (user.role === "artist") {
      userProfile = await ArtistProfile.findOne({
        userId: userId,
      })
        .select("bio website socialLinks specialties verified rating")
        .lean();
    }

    // ✅ Step 3: Get artwork statistics and artworks based on user type
    let artworkStats, artworksResponse;

    if (user.role === "artist") {
      const artistObjectId = new mongoose.Types.ObjectId(userId);

      artworkStats = await Artwork.aggregate([
        {
          $match: {
            artist: artistObjectId,
            status: "approved",
          },
        },
        {
          $group: {
            _id: null,
            totalArtworks: { $sum: 1 },
            totalLikes: { $sum: "$engagementStats.totalLikes" },
            totalViews: { $sum: "$engagementStats.totalViews" },
            soldArtworks: {
              $sum: {
                $cond: [{ $ne: ["$artist", "$currentOwner"] }, 1, 0],
              },
            },
            availableArtworks: {
              $sum: {
                $cond: [{ $eq: ["$artist", "$currentOwner"] }, 1, 0],
              },
            },
          },
        },
      ]);


      // ✅ FALLBACK: If aggregation fails, use direct count
      if (!artworkStats || artworkStats.length === 0) {
        const totalCount = await Artwork.countDocuments({
          artist: artistObjectId,
          status: "approved",
        });

        const soldCount = await Artwork.countDocuments({
          artist: artistObjectId,
          status: "approved",
          $expr: { $ne: ["$artist", "$currentOwner"] },
        });

        artworkStats = [
          {
            totalArtworks: totalCount,
            soldArtworks: soldCount,
            availableArtworks: totalCount - soldCount,
            totalLikes: 0,
            totalViews: 0,
          },
        ];

        logger.warn(
          `Using fallback stats for artist ${userId}:`,
          artworkStats[0]
        );
      }

      // ✅ FIXED: For Sale - Artworks still owned by artist
      const forSaleArtworks = await Artwork.find({
        artist: artistObjectId, // ✅ Use same ObjectId
        currentOwner: artistObjectId, // ✅ Still owned by artist
        status: "approved",
      })
        .select(
          "_id title price images tags medium dimensions year engagementStats createdAt"
        )
        .sort({ createdAt: -1 })
        .limit(12)
        .lean();

      // ✅ FIXED: Sold - Artworks created by artist but now owned by others
      const soldArtworks = await Artwork.find({
        artist: artistObjectId, // ✅ Use same ObjectId
        status: "approved",
        $expr: { $ne: ["$artist", "$currentOwner"] }, // ✅ Different owner = sold
      })
        .select(
          "_id title images engagementStats createdAt medium tags lastSaleDate currentOwner price"
        )
        .populate("currentOwner", "username")
        .sort({ lastSaleDate: -1 })
        .limit(8)
        .lean();

      // ✅ FIXED: Popular - Most engaged artworks (regardless of ownership)
      const popularArtworks = await Artwork.find({
        artist: artistObjectId, // ✅ Use same ObjectId
        status: "approved",
        $or: [
          { "engagementStats.totalLikes": { $gt: 0 } },
          { "engagementStats.totalViews": { $gt: 0 } },
        ],
      })
        .select("_id title images price engagementStats createdAt medium tags")
        .sort({
          "engagementStats.popularityScore": -1,
          "engagementStats.totalLikes": -1,
          "engagementStats.totalViews": -1,
          createdAt: -1,
        })
        .limit(6)
        .lean();

      // ✅ DEBUGGING: Log the actual counts vs aggregation results
      logger.info(`Artist ${userId} artwork counts:`, {
        forSaleFound: forSaleArtworks.length,
        soldFound: soldArtworks.length,
        popularFound: popularArtworks.length,
        aggregationTotal: artworkStats[0]?.totalArtworks || 0,
        aggregationAvailable: artworkStats[0]?.availableArtworks || 0,
        aggregationSold: artworkStats[0]?.soldArtworks || 0,
      });

      // ✅ FIXED: Proper artwork response structure for artists
      artworksResponse = {
        forSale: forSaleArtworks,
        sold: soldArtworks.map((artwork) => ({
          _id: artwork._id,
          title: artwork.title,
          images: artwork.images,
          engagementStats: artwork.engagementStats,
          createdAt: artwork.createdAt,
          medium: artwork.medium,
          tags: artwork.tags,
          // ✅ Enhanced sold artwork context
          soldTo: artwork.currentOwner?.username || "Private Collector",
          soldDate: artwork.lastSaleDate,
          wasListedFor: artwork.price, // Original listing price
        })),
        popular: popularArtworks,
        counts: {
          forSale: forSaleArtworks.length,
          sold: soldArtworks.length,
          total: artworkStats[0]?.totalArtworks || 0,
        },
      };
    } else {
      // ✅ FIXED: For buyers/collectors - show owned collection
      artworkStats = await Artwork.aggregate([
        { $match: { currentOwner: userId, status: "approved" } },
        {
          $group: {
            _id: null,
            totalArtworks: { $sum: 1 }, // Total owned
            totalLikes: { $sum: "$engagementStats.totalLikes" },
            totalViews: { $sum: "$engagementStats.totalViews" },
            collectedArtworks: { $sum: 1 }, // All are collected
            originalCreations: {
              $sum: {
                $cond: [{ $eq: ["$artist", "$currentOwner"] }, 1, 0], // Very rare for buyers
              },
            },
          },
        },
      ]);

      // Collection: Artworks owned by this collector
      const ownedArtworks = await Artwork.find({
        currentOwner: userId,
        status: "approved",
      })
        .select(
          "_id title images price engagementStats createdAt medium tags artist"
        )
        .populate("artist", "username") // Show original artist
        .sort({
          // Sort by most recent acquisition if available, otherwise by creation date
          "ownershipHistory.purchaseDate": -1,
          createdAt: -1,
        })
        .limit(12)
        .lean();

      // Popular = most liked in their collection
      const popularArtworks = await Artwork.find({
        currentOwner: userId,
        status: "approved",
        $or: [
          { "engagementStats.totalLikes": { $gt: 0 } },
          { "engagementStats.totalViews": { $gt: 0 } },
        ],
      })
        .select(
          "_id title images price engagementStats createdAt medium tags artist"
        )
        .populate("artist", "username")
        .sort({
          "engagementStats.popularityScore": -1,
          "engagementStats.totalLikes": -1,
        })
        .limit(6)
        .lean();

      // ✅ FIXED: Proper artwork response structure for collectors
      artworksResponse = {
        collection: ownedArtworks.map((artwork) => ({
          _id: artwork._id,
          title: artwork.title,
          images: artwork.images,
          price: artwork.price,
          engagementStats: artwork.engagementStats,
          createdAt: artwork.createdAt,
          medium: artwork.medium,
          tags: artwork.tags,
          artist: artwork.artist, // Show original creator
          // ✅ Enhanced collection context
          originalArtist: artwork.artist?.username || "Unknown Artist",
          // Note: Don't show purchase price for privacy
        })),
        popular: popularArtworks.map((artwork) => ({
          _id: artwork._id,
          title: artwork.title,
          images: artwork.images,
          price: artwork.price,
          engagementStats: artwork.engagementStats,
          createdAt: artwork.createdAt,
          medium: artwork.medium,
          tags: artwork.tags,
          artist: artwork.artist,
          originalArtist: artwork.artist?.username || "Unknown Artist",
        })),
        counts: {
          collection: ownedArtworks.length,
          total: artworkStats[0]?.totalArtworks || 0,
        },
      };
    }

    // ✅ Step 4: Check engagement context for current user
    let engagementContext = {
      isFollowing: false,
      canFollow: false,
      canMessage: false,
    };

    if (currentUserId && currentUserId !== userId) {
      const currentUser = await User.findById(currentUserId).select(
        "followedArtists role"
      );
      if (currentUser) {
        engagementContext = {
          isFollowing: currentUser.followedArtists?.includes(userId) || false,
          canFollow: user.role === "artist", // Can only follow artists, not collectors
          canMessage: currentUser.role !== user.role, // Cross-role messaging
        };
      }
    }

    // ✅ Step 5: Get recent activity summary (for both artists and collectors)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let recentActivity;

    if (user.role === "artist") {
      // For artists: New artworks created
      recentActivity = await Artwork.aggregate([
        {
          $match: {
            artist: userId,
            createdAt: { $gte: thirtyDaysAgo },
            status: "approved",
          },
        },
        {
          $group: {
            _id: null,
            newArtworks: { $sum: 1 },
            newLikes: { $sum: "$engagementStats.totalLikes" },
            newViews: { $sum: "$engagementStats.totalViews" },
          },
        },
      ]);
    } else {
      // For collectors: New artworks acquired (check ownership history)
      recentActivity = await Artwork.aggregate([
        {
          $match: {
            currentOwner: userId,
            status: "approved",
            // Check if acquired recently by looking at ownership history
            $or: [
              {
                ownershipHistory: {
                  $elemMatch: {
                    owner: userId,
                    purchaseDate: { $gte: thirtyDaysAgo },
                  },
                },
              },
              // Fallback: if no ownership history, check creation date
              { createdAt: { $gte: thirtyDaysAgo } },
            ],
          },
        },
        {
          $group: {
            _id: null,
            newArtworks: { $sum: 1 }, // New acquisitions
            newLikes: { $sum: "$engagementStats.totalLikes" },
            newViews: { $sum: "$engagementStats.totalViews" },
          },
        },
      ]);
    }

    // ✅ Step 6: Build complete profile response based on user type
    const baseStats = artworkStats[0] || {
      totalArtworks: 0,
      totalLikes: 0,
      totalViews: 0,
      soldArtworks: user.role === "artist" ? 0 : undefined,
      availableArtworks: user.role === "artist" ? 0 : undefined,
      collectedArtworks: user.role === "buyer" ? 0 : undefined,
    };

    // ✅ FIXED: Sales rate calculation
    const salesRate =
      user.role === "artist" && baseStats.totalArtworks > 0
        ? ((baseStats.soldArtworks / baseStats.totalArtworks) * 100).toFixed(1)
        : user.role === "artist"
        ? "0"
        : undefined;

    const completeProfile = {
      // Basic user information
      user: {
        id: user._id,
        username: user.username,
        profile: user.profile,
        role: user.role, // "artist" or "buyer"
        joinedDate: user.createdAt,
        lastActive: user.lastActive,
        verified: true,
        profileType: user.role === "artist" ? "Artist" : "Collector",
      },

      // Extended profile (only for artists)
      extendedProfile:
        user.role === "artist" && userProfile
          ? {
              bio: userProfile.bio || "",
              website: userProfile.website || "",
              socialLinks: userProfile.socialLinks || {},
              specialties: userProfile.specialties || [],
              verified: userProfile.verified || false,
              rating: userProfile.rating || { average: 0, count: 0 },
            }
          : null,

      // Statistics based on user type
      stats: {
        // Common stats
        followers: user.engagementStats?.totalFollowers || 0,

        // Artwork stats (different for artists vs collectors)
        totalArtworks: baseStats.totalArtworks,
        totalLikes: baseStats.totalLikes,
        totalViews: baseStats.totalViews,

        // Artist-specific stats
        ...(user.role === "artist" && {
          soldArtworks: baseStats.soldArtworks,
          availableArtworks: baseStats.availableArtworks,
          salesRate: salesRate,
        }),

        // Collector-specific stats
        ...(user.role === "buyer" && {
          collectedArtworks: baseStats.collectedArtworks,
          collectionValue: "Private", // Don't show monetary value
        }),

        // Recent activity tracking
        recentActivity: recentActivity?.[0] || {
          newArtworks: 0,
          newLikes: 0,
          newViews: 0,
        },
      },

      // ✅ FIXED: Artworks organized by user type
      artworks: artworksResponse,

      // User interaction context
      engagement: engagementContext,

      // Additional metadata
      meta: {
        profileCompleteness: userProfile
          ? 85
          : user.role === "artist"
          ? 45
          : 75,
        responseTime:
          user.role === "artist"
            ? "Usually responds within 24 hours"
            : "Private collector",
        trustScore:
          (user.engagementStats?.totalFollowers || 0) > 10
            ? "High"
            : "Building",
        memberSince: new Date(user.createdAt).getFullYear(),
        lastSeenStatus: user.lastActive
          ? getLastSeenStatus(user.lastActive)
          : "Unknown",
        profileType:
          user.role === "artist" ? "Creator Profile" : "Collector Profile",
      },
    };

    res.status(200).json({
      status: "success",
      data: { profile: completeProfile },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getCompleteArtistProfile controller: ${error.message}`
    );
  }
};

// Helper function to check if user can have a public profile
const checkPublicProfileEligibility = async (userId, userRole) => {
  // Artists always have public profiles
  if (userRole === "artist") {
    return true;
  }

  // Buyers/collectors can have public profiles IF they own at least one artwork
  const ownedArtworkCount = await Artwork.countDocuments({
    currentOwner: userId,
    status: "approved",
  });

  return ownedArtworkCount > 0;
};

// Helper function to get user-friendly last seen status
const getLastSeenStatus = (lastActive) => {
  const now = new Date();
  const lastActiveDate = new Date(lastActive);
  const diffInMinutes = Math.floor((now - lastActiveDate) / (1000 * 60));

  if (diffInMinutes < 5) return "Online";
  if (diffInMinutes < 60) return `Active ${diffInMinutes}m ago`;
  if (diffInMinutes < 1440)
    return `Active ${Math.floor(diffInMinutes / 60)}h ago`;
  if (diffInMinutes < 10080)
    return `Active ${Math.floor(diffInMinutes / 1440)}d ago`;
  return "Active over a week ago";
};

module.exports = {
  getCompleteArtistProfile,
};

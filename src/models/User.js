// User schema (artists, buyers, admin)
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config/config");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ["artist", "buyer", "admin"],
      default: "buyer",
    },
    credits: {
      type: Number,
      default: 0,
    },
    profile: {
      bio: String,
      website: String,
      socialLinks: {
        facebook: String,
        twitter: String,
        instagram: String,
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationOTP: {
      type: String,
      select: false,
    },
    verificationOTPExpires: {
      type: Date,
      select: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    stripeCustomerId: {
      type: String,
      select: false, // Don't return in normal queries for security
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likedArtworks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artwork",
      },
    ],
    followedArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    engagementStats: {
      totalLikes: {
        type: Number,
        default: 0,
      },
      totalFollowing: {
        type: Number,
        default: 0,
      },
      totalFollowers: {
        type: Number,
        default: 0,
      },
      lastActivityAt: {
        type: Date,
        default: Date.now,
      },
    },
    messageStats: {
      totalSent: {
        type: Number,
        default: 0,
      },
      totalReceived: {
        type: Number,
        default: 0,
      },
      lastMessageAt: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Password hashing middleware
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(
    this.password,
    config.security.bcryptRounds
  );
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if user is blocked
userSchema.methods.isUserBlocked = function (userId) {
  return this.blockedUsers && this.blockedUsers.includes(userId);
};

// Instance method to block a user
userSchema.methods.blockUser = function (userId) {
  if (!this.blockedUsers) {
    this.blockedUsers = [];
  }
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
  }
  return this.save();
};

// Instance method to unblock a user
userSchema.methods.unblockUser = function (userId) {
  if (this.blockedUsers) {
    this.blockedUsers = this.blockedUsers.filter(
      (id) => id.toString() !== userId.toString()
    );
  }
  return this.save();
};

// Static method to get online users
userSchema.statics.getOnlineUsers = function (role = null) {
  const filter = { isOnline: true };
  if (role) {
    filter.role = role;
  }
  return this.find(filter).select("username role lastSeen");
};

// Static method to update user online status
userSchema.statics.updateOnlineStatus = function (userId, isOnline) {
  return this.findByIdAndUpdate(userId, {
    isOnline,
    lastSeen: new Date(),
  });
};

// Instance method to check if user has liked an artwork
userSchema.methods.hasLikedArtwork = function (artworkId) {
  return this.likedArtworks && this.likedArtworks.includes(artworkId);
};

// Instance method to like/unlike an artwork
userSchema.methods.toggleArtworkLike = function (artworkId) {
  if (!this.likedArtworks) {
    this.likedArtworks = [];
  }

  const index = this.likedArtworks.indexOf(artworkId);
  let action = "";

  if (index > -1) {
    this.likedArtworks.splice(index, 1);
    this.engagementStats.totalLikes = Math.max(
      0,
      this.engagementStats.totalLikes - 1
    );
    action = "unliked";
  } else {
    this.likedArtworks.push(artworkId);
    this.engagementStats.totalLikes += 1;
    action = "liked";
  }

  this.engagementStats.lastActivityAt = new Date();
  return { action, totalLikes: this.engagementStats.totalLikes };
};

// Instance method to check if user is following an artist
userSchema.methods.isFollowingArtist = function (artistId) {
  return this.followedArtists && this.followedArtists.includes(artistId);
};

// Instance method to follow/unfollow an artist
userSchema.methods.toggleArtistFollow = function (artistId) {
  if (!this.followedArtists) {
    this.followedArtists = [];
  }

  const index = this.followedArtists.indexOf(artistId);
  let action = "";

  if (index > -1) {
    this.followedArtists.splice(index, 1);
    this.engagementStats.totalFollowing = Math.max(
      0,
      this.engagementStats.totalFollowing - 1
    );
    action = "unfollowed";
  } else {
    this.followedArtists.push(artistId);
    this.engagementStats.totalFollowing += 1;
    action = "followed";
  }

  this.engagementStats.lastActivityAt = new Date();
  return { action, totalFollowing: this.engagementStats.totalFollowing };
};

// Static method to get user's liked artworks with pagination
userSchema.statics.getUserLikedArtworks = function (userId, option = {}) {
  const { page = 1, limit = 10 } = option;
  const skip = (page - 1) * limit;

  return this.findById(userId)
    .populate({
      path: "likedArtworks",
      match: { status: "approved" },
      populate: {
        path: "artist",
        select: "username profile",
      },
      options: {
        sort: { createdAt: -1 },
        skip: skip,
        limit: parseInt(limit),
      },
    })
    .select("likedArtworks engagementStats");
};

// Static method to get user's followed artists
userSchema.statics.getUserFollowedArtists = function (userId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  return this.findById(userId)
    .populate({
      path: "followedArtists",
      match: { role: "artist", isVerified: true },
      select: "username profile engagementStats createdAt",
      options: {
        sort: { "engagementStats.lastActivityAt": -1 },
        skip: skip,
        limit: parseInt(limit),
      },
    })
    .select("followedArtists engagementStats");
};

// Static method to get user with engagement context for artworks
userSchema.statics.getUserWithEngagementContext = function (
  userId,
  artworkIds = []
) {
  return this.findById(userId)
    .select("likedArtworks followedArtists engagementStats role")
    .lean()
    .then((user) => {
      if (!user) return null;

      return {
        ...user,
        engagementContext: {
          likedArtworks: user.likedArtworks || [],
          followedArtists: user.followedArtists || [],
          hasLikedArtwork: (artworkId) =>
            user.likedArtworks?.includes(artworkId) || false,
          isFollowingArtist: (artistId) =>
            user.followedArtists?.includes(artistId) || false,
        },
      };
    });
};

// Index for online status queries
userSchema.index({ isOnline: 1, lastSeen: -1 });

// Index for blocked users
userSchema.index({ blockedUsers: 1 });

// Index for liked artworks queries
userSchema.index({ likedArtworks: 1 });

// Index for following/followers queries
userSchema.index({ followedArtists: 1 });
userSchema.index({ followers: 1 });

// Index for engagement stats
userSchema.index({ "engagementStats.totalFollowers": -1 });
userSchema.index({ "engagementStats.lastActivityAt": -1 });

// Virtual property to get all artworks by this user (if artist)
userSchema.virtual("artworks", {
  ref: "Artwork",
  foreignField: "artist",
  localField: "_id",
});

const User = mongoose.model("User", userSchema);

module.exports = User;

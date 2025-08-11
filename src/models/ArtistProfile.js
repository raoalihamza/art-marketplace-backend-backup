// Extended artist information
const mongoose = require("mongoose");

const artistProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    socialLinks: {
      facebook: String,
      twitter: String,
      instagram: String,
      pinterest: String,
    },
    portfolioImages: [String],
    verified: {
      type: Boolean,
      default: false,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    rating: {
      average: {
        type: Number,
        default: 0,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    specialties: [String],
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    featuredArtwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual property to get all artworks by this artist
artistProfileSchema.virtual("artworks", {
  ref: "Artwork",
  foreignField: "artist",
  localField: "userId",
});

const ArtistProfile = mongoose.model("ArtistProfile", artistProfileSchema);

module.exports = ArtistProfile;
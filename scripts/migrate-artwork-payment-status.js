// const mongoose = require("mongoose");
// const config = require("../src/config/config");

// // Import models
// const Artwork = require("../src/models/Artwork");
// const ListingPayment = require("../src/models/ListingPayment");

// const migrateArtworkPaymentStatus = async () => {
//   try {
//     // Connect to database
//     await mongoose.connect(config.mongodb.uri);
//     console.log("Connected to MongoDB for migration");

//     console.log("Starting artwork payment status migration...");

//     // Find all existing artworks
//     const artworks = await Artwork.find({}).select("_id");
//     console.log(`Found ${artworks.length} artworks to migrate`);

//     let migratedCount = 0;
//     let paidCount = 0;
//     let pendingCount = 0;
//     let unpaidCount = 0;

//     for (const artwork of artworks) {
//       // Check if there's a completed listing payment
//       const completedPayment = await ListingPayment.findOne({
//         artwork: artwork._id,
//         status: "completed",
//       });

//       if (completedPayment) {
//         // Mark as paid
//         await Artwork.updateOne(
//           { _id: artwork._id },
//           {
//             listingFeeStatus: "paid",
//             listingFeePaidAt:
//               completedPayment.paidAt || completedPayment.createdAt,
//             listingFeePaymentIntent: completedPayment.paymentIntent,
//           }
//         );
//         paidCount++;
//       } else {
//         // Check if there's a pending payment
//         const pendingPayment = await ListingPayment.findOne({
//           artwork: artwork._id,
//           status: "pending",
//         });

//         if (pendingPayment) {
//           // Mark as pending
//           await Artwork.updateOne(
//             { _id: artwork._id },
//             {
//               listingFeeStatus: "pending",
//               listingFeePaymentIntent: pendingPayment.paymentIntent,
//             }
//           );
//           pendingCount++;
//         } else {
//           // Mark as unpaid (this will be the default for new artworks)
//           await Artwork.updateOne(
//             { _id: artwork._id },
//             { listingFeeStatus: "unpaid" }
//           );
//           unpaidCount++;
//         }
//       }
//       migratedCount++;

//       // Progress indicator
//       if (migratedCount % 100 === 0) {
//         console.log(`Migrated ${migratedCount}/${artworks.length} artworks...`);
//       }
//     }

//     console.log(`Migration completed successfully!`);
//     console.log(`- Total artworks migrated: ${migratedCount}`);
//     console.log(`- Paid artworks: ${paidCount}`);
//     console.log(`- Pending artworks: ${pendingCount}`);
//     console.log(`- Unpaid artworks: ${unpaidCount}`);
//   } catch (error) {
//     console.error("Migration failed:", error);
//     process.exit(1);
//   } finally {
//     // Close database connection
//     await mongoose.connection.close();
//     console.log("Database connection closed");
//     process.exit(0);
//   }
// };

// // Run migration if this file is executed directly
// if (require.main === module) {
//   migrateArtworkPaymentStatus();
// }

// module.exports = migrateArtworkPaymentStatus;

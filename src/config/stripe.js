const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const config = require("./config");
const logger = require("../utils/logger");

// Test Stripe connection
const testStripeConnection = async () => {
  try {
    await stripe.accounts.retrieve();
    logger.info("Stripe connection successful");
    return true;
  } catch (error) {
    logger.error("Stripe connection failed:", error.message);
    return false;
  }
};

// Payment configurations
const paymentConfig = {
  listingFee: {
    amount: 100, // €1 in cents
    currency: "eur",
    description: "Artwork listing fee",
  },
  successUrl: `${config.frontendUrl}/payment/success`,
  cancelUrl: `${config.frontendUrl}/payment/cancel`,
  webhookEndpointSecret: config.stripe.webhookSecret,
};

// Common Stripe session options
const getSessionOptions = (customerId, metadata = {}) => ({
  customer: customerId,
  payment_method_types: ["card"],
  mode: "payment",
  metadata,
  success_url: paymentConfig.successUrl + "?session_id={CHECKOUT_SESSION_ID}",
  cancel_url: paymentConfig.cancelUrl,
  expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
});

module.exports = {
  stripe,
  testStripeConnection,
  paymentConfig,
  getSessionOptions,
};

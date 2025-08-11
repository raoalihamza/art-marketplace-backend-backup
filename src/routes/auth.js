const express = require("express");
const authController = require("../controllers/authController");
const {
  validateRegister,
  validateOTPVerification,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateUpdatePassword,
  validateUpdateProfile,
} = require("../validators/authValidator");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.post("/register", validateRegister, authController.register);
router.post("/verify-otp", validateOTPVerification, authController.verifyOTP);
router.post("/resend-otp", validateForgotPassword, authController.resendOTP); // using same validation as forgot password
router.post("/login", validateLogin, authController.login);
router.post(
  "/forgot-password",
  validateForgotPassword,
  authController.forgotPassword
);
router.post(
  "/reset-password/:token",
  validateResetPassword,
  authController.resetPassword
);

// Protected routes
router.use(protect); // Protect all routes below this middleware

router.post("/logout", authController.logout);
router.get("/me", authController.getMe);
router.patch(
  "/update-profile",
  validateUpdateProfile,
  authController.updateProfile
);
router.patch(
  "/update-password",
  validateUpdatePassword,
  authController.updatePassword
);

module.exports = router;

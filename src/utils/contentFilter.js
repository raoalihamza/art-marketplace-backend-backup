// Content filtering utility to prevent sharing contact information and inappropriate content

// Basic profanity list (extend this based on your requirements)
const PROFANITY_WORDS = [
  // Add profanity words here - keeping it minimal for example
  "badword1",
  "badword2",
  // Add more as needed
];

// Contact information patterns
const CONTACT_PATTERNS = {
  email: /[\w\.-]+@[\w\.-]+\.\w+/gi,
  phone:
    /(\+?\d{1,4}[\s\-]?)?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}/g,
  socialHandle: /@[a-zA-Z0-9_]+/g,
  url: /(https?:\/\/[^\s]+|www\.[^\s]+)/gi,
  whatsapp: /(whatsapp|wa\.me)/gi,
  telegram: /(telegram|t\.me)/gi,
  instagram: /(instagram|insta)/gi,
  facebook: /(facebook|fb\.com)/gi,
  twitter: /(twitter|x\.com)/gi,
  skype: /skype/gi,
  discord: /discord/gi,
  // Common ways people try to share contact info
  contactMe: /(contact\s+me|reach\s+me|call\s+me|text\s+me)/gi,
  meetOutside: /(meet\s+outside|outside\s+platform|off\s+platform)/gi,
};

// Suspicious contact-sharing phrases
const CONTACT_PHRASES = [
  "contact me at",
  "reach me at",
  "call me at",
  "text me at",
  "my number is",
  "my email is",
  "find me on",
  "add me on",
  "follow me on",
  "dm me on",
  "message me on",
  "whatsapp me",
  "telegram me",
  "email me",
  "outside this app",
  "off this platform",
  "meet outside",
  "contact directly",
  "reach directly",
];

/**
 * Filter profanity from content
 * @param {string} content - The content to filter
 * @returns {string} - Filtered content
 */
const filterProfanity = (content) => {
  let filteredContent = content;

  PROFANITY_WORDS.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    filteredContent = filteredContent.replace(regex, "*".repeat(word.length));
  });

  return filteredContent;
};

/**
 * Remove contact information from content
 * @param {string} content - The content to filter
 * @returns {string} - Filtered content
 */
const removeContactInfo = (content) => {
  let filteredContent = content;

  // Replace email addresses
  filteredContent = filteredContent.replace(
    CONTACT_PATTERNS.email,
    "[EMAIL REMOVED]"
  );

  // Replace phone numbers
  filteredContent = filteredContent.replace(
    CONTACT_PATTERNS.phone,
    "[PHONE REMOVED]"
  );

  // Replace social media handles
  filteredContent = filteredContent.replace(
    CONTACT_PATTERNS.socialHandle,
    "[HANDLE REMOVED]"
  );

  // Replace URLs
  filteredContent = filteredContent.replace(
    CONTACT_PATTERNS.url,
    "[LINK REMOVED]"
  );

  // Replace platform mentions
  Object.keys(CONTACT_PATTERNS).forEach((key) => {
    if (
      key !== "email" &&
      key !== "phone" &&
      key !== "socialHandle" &&
      key !== "url"
    ) {
      filteredContent = filteredContent.replace(
        CONTACT_PATTERNS[key],
        "[PLATFORM REMOVED]"
      );
    }
  });

  // Filter suspicious contact phrases
  CONTACT_PHRASES.forEach((phrase) => {
    const regex = new RegExp(phrase, "gi");
    filteredContent = filteredContent.replace(
      regex,
      "[CONTACT REQUEST REMOVED]"
    );
  });

  return filteredContent;
};

/**
 * Check if content contains prohibited contact information
 * @param {string} content - The content to check
 * @returns {object} - Validation result with isValid and violations
 */
const validateMessageContent = (content) => {
  const violations = [];

  // Check for email addresses
  if (CONTACT_PATTERNS.email.test(content)) {
    violations.push("Email addresses are not allowed");
  }

  // Check for phone numbers
  if (CONTACT_PATTERNS.phone.test(content)) {
    violations.push("Phone numbers are not allowed");
  }

  // Check for URLs
  if (CONTACT_PATTERNS.url.test(content)) {
    violations.push("URLs and links are not allowed");
  }

  // Check for social media mentions
  if (CONTACT_PATTERNS.socialHandle.test(content)) {
    violations.push("Social media handles are not allowed");
  }

  // Check for platform mentions
  const platformKeys = [
    "whatsapp",
    "telegram",
    "instagram",
    "facebook",
    "twitter",
    "skype",
    "discord",
  ];
  platformKeys.forEach((platform) => {
    if (CONTACT_PATTERNS[platform].test(content)) {
      violations.push(`References to ${platform} are not allowed`);
    }
  });

  // Check for contact phrases
  const lowerContent = content.toLowerCase();
  CONTACT_PHRASES.forEach((phrase) => {
    if (lowerContent.includes(phrase)) {
      violations.push("Requests for direct contact are not allowed");
    }
  });

  return {
    isValid: violations.length === 0,
    violations,
  };
};

/**
 * Comprehensive content filter that combines all filtering methods
 * @param {string} content - The content to filter
 * @returns {string} - Completely filtered content
 */
const filterMessageContent = (content) => {
  if (!content || typeof content !== "string") {
    return content;
  }

  let filteredContent = content;

  // First remove contact information
  filteredContent = removeContactInfo(filteredContent);

  // Then filter profanity
  filteredContent = filterProfanity(filteredContent);

  // Clean up extra spaces
  filteredContent = filteredContent.replace(/\s+/g, " ").trim();

  return filteredContent;
};

/**
 * Advanced pattern detection for creative ways to share contact info
 * @param {string} content - The content to analyze
 * @returns {boolean} - True if suspicious patterns detected
 */
const detectSuspiciousPatterns = (content) => {
  const suspiciousPatterns = [
    // Number spelled out
    /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi,
    // Dots/spaces in emails
    /\w+\s+(at|@)\s+\w+\s+(dot|\.)\s+\w+/gi,
    // Creative phone number formats
    /\d+\s*[-._]\s*\d+\s*[-._]\s*\d+/g,
    // Social media without @ symbol
    /\b(instagram|facebook|twitter|telegram|whatsapp)\b\s*:?\s*\w+/gi,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(content));
};

/**
 * Calculate content safety score
 * @param {string} content - The content to analyze
 * @returns {object} - Safety analysis result
 */
const analyzeContentSafety = (content) => {
  const validation = validateMessageContent(content);
  const hasSuspiciousPatterns = detectSuspiciousPatterns(content);
  const profanityCount = PROFANITY_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`, "gi").test(content)
  ).length;

  let safetyScore = 100;

  // Deduct points for violations
  safetyScore -= validation.violations.length * 20;
  safetyScore -= profanityCount * 15;
  safetyScore -= hasSuspiciousPatterns ? 25 : 0;

  safetyScore = Math.max(0, safetyScore);

  return {
    safetyScore,
    isAcceptable: safetyScore >= 70,
    violations: validation.violations,
    hasProfanity: profanityCount > 0,
    hasSuspiciousPatterns,
    recommendation: safetyScore >= 70 ? "APPROVE" : "REJECT",
  };
};

module.exports = {
  filterProfanity,
  removeContactInfo,
  validateMessageContent,
  filterMessageContent,
  detectSuspiciousPatterns,
  analyzeContentSafety,
  CONTACT_PATTERNS,
  CONTACT_PHRASES,
};

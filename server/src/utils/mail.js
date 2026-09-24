import Mailgen from "mailgen";
import nodemailer from "nodemailer";

/**
 * Create and return a configured Nodemailer transporter
 * Supports Gmail and other SMTP servers via environment variables
 * @returns {nodemailer.Transporter} Configured email transporter
 */
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === "465", // true for 465, false for other ports (e.g., 587)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  };

  console.log(
    `[Email] Configuring ${config.host}:${config.port} (secure: ${config.secure})`
  );

  return nodemailer.createTransport(config);
};

// Email transporter instance (singleton)
let emailTransporter = null;

/**
 * Get or create the email transporter
 * @returns {nodemailer.Transporter} Email transporter instance
 */
const getTransporter = () => {
  if (!emailTransporter) {
    emailTransporter = createTransporter();
  }
  return emailTransporter;
};

/**
 * Send email with HTML and plain text versions
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {Object} options.mailgenContent - Mailgen email template content
 * @returns {Promise<void>}
 */
const sendEmail = async (options) => {
  try {
    // Validate required configuration
    if (
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASSWORD
    ) {
      throw new Error(
        "Email configuration incomplete. Check EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD in .env"
      );
    }

    // Generate email from mailgen template
    const mailGenerator = new Mailgen({
      theme: "default",
      product: {
        name: process.env.EMAIL_FROM_NAME || "Sentinel",
        link: process.env.APP_URL || "http://localhost:8000",
      },
    });

    const emailTextual = mailGenerator.generatePlaintext(
      options.mailgenContent
    );
    const emailHtml = mailGenerator.generate(options.mailgenContent);

    // Get transporter
    const transporter = getTransporter();

    // Prepare email
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_EMAIL}>`,
      to: options.email,
      subject: options.subject,
      text: emailTextual,
      html: emailHtml,
    };

    // Send email
    console.log(`[Email] Sending email to ${options.email}...`);
    const info = await transporter.sendMail(mailOptions);

    console.log(`[Email] ✅ Email sent successfully`);
    console.log(`[Email] Message ID: ${info.messageId}`);

    return info;
  } catch (error) {
    console.error("[Email] ❌ Failed to send email:", error.message);
    throw error;
  }
};

/**
 * Verify email transporter connection (useful for testing)
 * @returns {Promise<void>}
 */
const verifyEmailConnection = async () => {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log("[Email] ✅ Email transporter verified and ready to send");
  } catch (error) {
    console.error(
      "[Email] ❌ Email transporter verification failed:",
      error.message
    );
    throw error;
  }
};

/**
 * Send a test email to verify configuration
 * @param {string} testEmail - Email to send test to
 * @returns {Promise<void>}
 */
const sendTestEmail = async (testEmail) => {
  try {
    const testContent = {
      body: {
        name: "Test User",
        intro: "This is a test email from Sentinel",
        action: {
          instructions: "If you received this email, your email is configured correctly!",
          button: {
            color: "#22BC66",
            text: "View Application",
            link: process.env.APP_URL,
          },
        },
        outro: "Test email completed successfully.",
      },
    };

    await sendEmail({
      email: testEmail,
      subject: "🧪 Test Email - Sentinel",
      mailgenContent: testContent,
    });

    console.log(`[Email] Test email sent to ${testEmail}`);
  } catch (error) {
    console.error("[Email] Failed to send test email:", error.message);
    throw error;
  }
};

/**
 * Generate email verification content
 * @param {string} username - User's name
 * @param {string} otp - One-Time Password
 * @returns {Object} Mailgen email content
 */
const emailVerificationMailgenContent = (username, otp) => {
  return {
    body: {
      name: username,
      intro: "Welcome to Sentinel! We're excited to have you on board.",
      action: {
        instructions: "To verify your email address, please enter this One-Time Password (OTP) in the application:",
        button: {
          color: "#22BC66",
          text: otp,
          link: "#",
        },
      },
      outro:
        "This OTP is valid for 20 minutes. Need help? Reply to this email or contact our support team. We're here to help!",
    },
  };
};

/**
 * Generate password reset email content
 * @param {string} username - User's name
 * @param {string} otp - One-Time Password
 * @returns {Object} Mailgen email content
 */
const forgotPasswordMailgenContent = (username, otp) => {
  return {
    body: {
      name: username,
      intro: "We received a request to reset your account password.",
      action: {
        instructions:
          "To reset your password, please use the following One-Time Password (OTP):",
        button: {
          color: "#22BC66",
          text: otp,
          link: "#",
        },
      },
      outro:
        "If you didn't request this password reset, please ignore this email. This OTP is valid for 20 minutes.",
    },
  };
};

/**
 * Generate account confirmation email content
 * @param {string} username - User's name
 * @returns {Object} Mailgen email content
 */
const accountConfirmationMailgenContent = (username) => {
  return {
    body: {
      name: username,
      intro: "Your account has been confirmed successfully!",
      outro:
        "You can now log in to your account and start using Sentinel. Happy investigating!",
    },
  };
};

export {
  emailVerificationMailgenContent,
  forgotPasswordMailgenContent,
  accountConfirmationMailgenContent,
  sendEmail,
  sendTestEmail,
  verifyEmailConnection,
  getTransporter,
};

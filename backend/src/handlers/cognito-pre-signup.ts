import { PreSignUpTriggerEvent, Context } from 'aws-lambda';

/**
 * Cognito Pre Sign-Up Trigger
 * - Validates that the email belongs to the @rgmcet.edu.in domain
 * - Automatically confirms the user and verifies email (eliminating verification code friction)
 * - Executes in < 5ms without external DB/network calls to prevent Lambda cold-start timeouts
 */
export const handler = async (
  event: PreSignUpTriggerEvent,
  _context?: Context
): Promise<PreSignUpTriggerEvent> => {
  try {
    const userAttributes = event.request.userAttributes || {};
    const rawEmail = userAttributes.email || event.userName || '';
    const email = String(rawEmail).trim().toLowerCase();

    // Domain Validation: Must end with @rgmcet.edu.in
    if (!email || !email.endsWith('@rgmcet.edu.in') || email === '@rgmcet.edu.in') {
      throw new Error("Invalid email domain. Sign up requires a valid @rgmcet.edu.in email address.");
    }

    // Auto-confirm user and auto-verify email in Cognito
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;

    return event;
  } catch (error: any) {
    console.error('[PreSignUp Error]:', error.message || error);
    throw error;
  }
};

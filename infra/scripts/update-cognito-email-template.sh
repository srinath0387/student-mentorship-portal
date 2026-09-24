#!/bin/bash
# Update the Cognito User Pool OTP email subject & body to RGM ManageBAC branding.
# Run from any machine with AWS CLI + correct IAM credentials.
USER_POOL_ID="ap-south-1_sYp8CvKjn"
REGION="ap-south-1"

echo "Updating Cognito User Pool email template..."

aws cognito-idp update-user-pool \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --email-verification-subject "OTP for RGM ManageBAC - Your One-Time Password" \
  --email-verification-message "Dear Faculty, Your One-Time Password (OTP) for resetting the password of your RGM ManageBAC account ({username}) is: {####}. This OTP is valid for 1 hour. Do not share it with anyone. If you did not request this, please ignore this email. Regards, RGM ManageBAC System, RGM College of Engineering & Technology"

if [ $? -eq 0 ]; then
  echo "Email template updated successfully!"
else
  echo "Update failed. Check AWS credentials and try again."
fi

#!/usr/bin/env bash
# Builds the frontend as a static export and publishes it to the stack's
# S3 bucket + CloudFront distribution.
#
#   npm run deploy:web        # prod stack
#   npm run deploy:web:dev    # dev stack
#
# Deploy the stack first with EnableWebsite=true (it creates the bucket and
# distribution; CloudFront needs an AWS account verified by AWS Support).
set -euo pipefail

STAGE="${1:-prod}"
case "$STAGE" in
  prod) STACK="breathesafe-campus" ;;
  dev) STACK="breathesafe-campus-dev" ;;
  *) echo "Usage: $0 prod|dev" >&2; exit 1 ;;
esac
REGION="ap-south-1"

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

BUCKET="$(output SiteBucketName)"
DISTRIBUTION="$(output SiteDistributionId)"
SITE_URL="$(output SiteUrl)"
POOL_ID="$(output UserPoolId)"
CLIENT_ID="$(output UserPoolClientId)"
if [ -z "$BUCKET" ] || [ "$BUCKET" = "None" ]; then
  echo "Stack $STACK has no website yet. Deploy it with EnableWebsite=true" >&2
  echo "(the AWS account must be verified for CloudFront first)." >&2
  exit 1
fi

cd "$(dirname "$0")/../frontend"
echo "Building the site for $STAGE ..."
# Empty API URL = same origin: CloudFront routes /api/* to this stack's API.
NEXT_PUBLIC_API_URL="" \
NEXT_PUBLIC_COGNITO_USER_POOL_ID="$POOL_ID" \
NEXT_PUBLIC_COGNITO_CLIENT_ID="$CLIENT_ID" \
NEXT_TELEMETRY_DISABLED=1 \
  npx next build

echo "Uploading to s3://$BUCKET ..."
# Hashed build assets never change: cache them for a year.
aws s3 sync out/_next/static "s3://$BUCKET/_next/static" --region "$REGION" \
  --cache-control "public,max-age=31536000,immutable"
# Pages and data: always revalidate, so a deploy shows up immediately.
aws s3 sync out "s3://$BUCKET" --region "$REGION" --delete \
  --exclude "_next/static/*" \
  --cache-control "public,max-age=0,must-revalidate"

echo "Invalidating the CloudFront cache ..."
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query "Invalidation.Id" --output text

echo "Done: $SITE_URL"

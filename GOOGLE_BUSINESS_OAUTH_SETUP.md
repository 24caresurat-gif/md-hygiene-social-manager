# Google Business Profile OAuth Setup

## 1. Google Cloud

Use a Google Cloud project approved for Business Profile API access. Google currently requires project approval before the Business Profile APIs can be used, and the associated Business Profile APIs must be enabled.

Create an OAuth 2.0 Client ID with application type **Web application**.

For the production app, add this Authorized redirect URI:

```
https://YOUR_PRODUCTION_DOMAIN/api/google/business/callback
```

For local testing, add:

```
http://localhost:3000/api/google/business/callback
```

The OAuth scope used by this app is:

```
https://www.googleapis.com/auth/business.manage
```

The app requests offline access so the stored refresh token can be used for later Google syncs without asking the user to sign in every time.

## 2. Vercel environment variables

Add these variables to the **md-hygiene-social-manager** Vercel project:

```
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_PRODUCTION_DOMAIN/api/google/business/callback
```

Do not commit the client secret to GitHub and do not prefix these variables with `NEXT_PUBLIC_`.

## 3. What the app does after Connect Google

1. The selected workspace is verified against the signed-in Supabase user.
2. Google OAuth is started with a protected state value.
3. The authorization code is exchanged server-side.
4. The Google Business Profile accounts available to that Google user are imported into `social_accounts`.
5. Business Profile locations are imported into `google_business_profiles`.
6. Reviews are imported into `google_business_reviews`.
7. The OAuth refresh token is retained server-side so later syncs can refresh the access token.
8. The **Sync from Google** button refreshes locations and reviews for the selected workspace.

## 4. Reply management

The Google Business Profile API supports reading reviews and updating review replies. The current app has the review data model and import flow in place; reply creation/update should be wired as the next UI/API layer.

## 5. Important

There is no Google Business Profile API sandbox. Test with an actual Business Profile account and use a non-destructive read/import flow first.

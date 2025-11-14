const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const findOrCreateOAuthUser = require('../utils/findOrCreateOAuthUser');

function extractEmail(profile) {
  try {
    if (profile.emails && profile.emails.length)
      return profile.emails[0].value || profile.emails[0].email;

    if (profile._json) return profile._json.email;

    return profile.email || null;
  } catch {
    return null;
  }
}

function extractName(profile) {
  if (profile.displayName) return profile.displayName;
  if (profile.username) return profile.username;
  if (profile.name)
    return `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim();

  return null;
}

function normalize(profile, provider) {
  return {
    provider,
    providerId: profile.id,
    email: extractEmail(profile),
    fullname: extractName(profile)
  };
}

module.exports = function configurePassport(app) {
  
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const normalized = normalize(profile, "google");
            const user = await findOrCreateOAuthUser(normalized);
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }


  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: process.env.GITHUB_CALLBACK_URL,
          scope: ["user:email"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const normalized = normalize(profile, "github");
            const user = await findOrCreateOAuthUser(normalized);
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }

 
  if (app) app.use(passport.initialize());

  return passport;
};

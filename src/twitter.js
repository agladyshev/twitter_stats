const Twitter = require("twitter");
const moment = require("moment");

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

const fetchTwitterProfile = async account => {
  // Fetch basic profile twitter profile information and update account
  let updatedAccount;
  // Construct twitter API with user_id or screen_name

  const url = account.twitter_id
    ? `https://api.twitter.com/1.1/users/show.json?user_id=${account.twitter_id}`
    : `https://api.twitter.com/1.1/users/show.json?screen_name=${account.twitter_name}`;
  await client
    .get(url, {})
    .then(body => {
      const {
        id_str: twitterId,
        screen_name: twitterName,
        followers_count: twitterFollowers,
        statuses_count: tweets,
        profile_image_url: twitterPic
      } = body;
      const twitterStatus = "OK";
      updatedAccount = Object.assign(account, {
        twitterId,
        twitterName,
        twitterFollowers,
        tweets,
        twitterPic,
        twitterStatus
      });
    })
    .catch(error => {
      // Grab error message from twitter response and add pass it as a property to DB
      const twitterStatus = error[0].message;
      updatedAccount = Object.assign(account, { twitterStatus });
    });
  return updatedAccount;
};

function calculateStats(tweets) {
  return tweets.reduce(
    (accumulator, tweet) => {
      // Find tweets within a selected period of time
      // Append selected tweet stats to stat pool
      if (
        moment(tweet.created_at, "dd MMM DD HH:mm:ss ZZ YYYY", "en").isAfter(
          moment().subtract(process.env.STATS_SINCE_DAYS, "days")
        )
      ) {
        return {
          retweetsRecent: accumulator.retweetsRecent + tweet.retweet_count,
          favoritesRecent: accumulator.favoritesRecent + tweet.favorite_count,
          tweetsRecent: accumulator.tweetsRecent + 1
        };
      }
      return accumulator;
    },
    { retweetsRecent: 0, favoritesRecent: 0, tweetsRecent: 0 }
  );
}

const fetchTwitterStats = async account => {
  // Fetch recent tweets and calculate statistics
  // Update account with statistics
  let updatedAccount;
  const url = `https://api.twitter.com/1.1/statuses/user_timeline.json?user_id=${account.twitterId}&trim_user=true&exclude_replies=true&include_rts=false`;
  await client
    .get(url, {})
    .then(tweets => {
      const twitterStats = calculateStats(tweets);
      updatedAccount = Object.assign(account, twitterStats, {
        twitterCycle: process.env.STATS_SINCE_DAYS
      });
    })
    .catch(error => {
      const twitterStatus = error[0].message;
      updatedAccount = Object.assign(account, { twitterStatus });
    });
  return updatedAccount;
};

module.exports = {
  fetchTwitterProfile,
  fetchTwitterStats
};

const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const assert = require('assert');
const Twitter = require('twitter');
const moment = require('moment');
require('dotenv').config();

const port = process.env.PORT || 3001;

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}${process.env.DB_HOST}/test?retryWrites=true`;

// Twitter API calls

const fetchTwitterProfile = async (account) => {
  // Fetch basic profile twitter profile information and update account
  let updatedAccount;
  // Construct twitter API with user_id or screen_name
  const url = account.twitter_id ?
    `https://api.twitter.com/1.1/users/show.json?user_id=${account.twitter_id}` :
    `https://api.twitter.com/1.1/users/show.json?screen_name=${account.twitter_name}`;
  await client.get(url, {})
    .then((body) => {
      const {
        id_str: twitterId,
        screen_name: twitterName,
        followers_count: twitterFollowers,
        statuses_count: tweets,
        profile_image_url: twitterPic,
      } = body;
      const twitterStatus = 'OK';
      updatedAccount = Object.assign(account, {
        twitterId, twitterName, twitterFollowers, tweets, twitterPic, twitterStatus,
      });
    })
    .catch((error) => {
      // Grab error message from twitter response and add pass it as a property to DB
      const twitterStatus = error[0].message;
      updatedAccount = Object.assign(account, { twitterStatus });
    });
  return updatedAccount;
};

const fetchProfileStats = async (account) => {
  // Fetch recent tweets and calculate statistics
  // Update account with statistics
  let updatedAccount;
  const url = `https://api.twitter.com/1.1/statuses/user_timeline.json?user_id=${account.twitter_id}&trim_user=true&exclude_replies=true&include_rts=false`;
  await client.get(url, {})
    .then((tweets) => {
      const twitterStats = tweets.reduce((accumulator, tweet) => {
        // Find tweets within a selected period of time
        // Append selected tweet stats to stat pool
        if (moment(tweet.created_at, 'dd MMM DD HH:mm:ss ZZ YYYY', 'en')
          .isAfter(moment().subtract(process.env.STATS_SINCE_DAYS, 'days'))) {
          return {
            retweetsRecent: accumulator.retweetsRecent + tweet.retweet_count,
            favoritesRecent: accumulator.favoritesRecent + tweet.favorite_count,
            tweetsRecent: accumulator.tweetsRecent + 1,
          };
        }
        return accumulator;
      }, { retweetsRecent: 0, favoritesRecent: 0, tweetsRecent: 0 });
      updatedAccount = Object.assign(
        account, twitterStats,
        { twitterCycle: process.env.STATS_SINCE_DAYS },
      );
    })
    .catch((error) => {
      const twitterStatus = error[0].message;
      updatedAccount = Object.assign(account, { twitterStatus });
    });
  return updatedAccount;
};

// MongoDB API calls

const getMongoAccounts = async () => {
  // Grab influencers' accounts from DB with twitter name filled
  let accounts;
  try {
    const mongo = await MongoClient.connect(uri, { useNewUrlParser: true });
    const db = mongo.db(process.env.DB_NAME);
    const col = db.collection(process.env.DB_COLLECTION);
    accounts = await col.find({ twitter_name: { $gt: '' } }).project({ twitter_name: 1, twitter_id: 1 }).toArray();
    mongo.close();
  } catch (e) {
    console.error(e);
  }
  return accounts;
};

const updateMongoProfile = async (account) => {
  // Update twitter profile info in DB
  try {
    const mongo = await MongoClient.connect(uri, { useNewUrlParser: true });
    const db = mongo.db(process.env.DB_NAME);
    const col = db.collection(process.env.DB_COLLECTION);
    col.updateOne(
      { _id: account._id }
      , {
        $set: {
          twitter_id: account.twitterId,
          twitter_name: account.twitterName,
          twitter_followers: account.twitterFollowers,
          tweets: account.tweets,
          twitter_pic: account.twitterPic,
          twitter_status: account.twitterStatus,
          twitter_updated: Date.now(),
        },
      }, (err, result) => {
        assert.equal(err, null);
        assert.equal(1, result.result.n);
      },
    );
    mongo.close();
  } catch (e) {
    console.error(e);
  }
};

const updateMongoTweets = async (account) => {
  // Update twitter stats in DB
  try {
    const mongo = await MongoClient.connect(uri, { useNewUrlParser: true });
    const db = mongo.db(process.env.DB_NAME);
    const col = db.collection(process.env.DB_COLLECTION);
    col.updateOne(
      { _id: account._id }
      , {
        $set: {
          twitter_retweets_recent: account.retweetsRecent,
          twitter_favorites_recent: account.favoritesRecent,
          tweets_recent: account.tweetsRecent,
          twitter_cycle: account.twitterCycle,
          twitter_status: account.twitterStatus,
          tweets_updated: Date.now(),
        },
      }, (err, result) => {
        assert.equal(err, null);
        assert.equal(1, result.result.n);
      },
    );
    mongo.close();
  } catch (e) {
    console.error(e);
  }
};

// Middleware

const getTwitterAccounts = async (req, res, next) => {
  // Load a list of influencers with twitter accounts from DB
  res.body = await getMongoAccounts();
  next();
};

const getTwitterProfiles = async (req, res, next) => {
  // Update accounts' twitter profile information
  const accounts = res.body;
  Promise.all(accounts.map(fetchTwitterProfile))
    .then((updatedAccounts) => {
      res.body = updatedAccounts;
      next();
    });
};

const updateTwitterProfiles = async (req, res, next) => {
  // For every account, update DB with twitter profile information
  const accounts = res.body;
  Promise.all(accounts.map(updateMongoProfile))
    .then(() => next());
};

const getTweetStats = async (req, res, next) => {
  // Update all accounts with twitter statistics
  const accounts = res.body;
  Promise.all(accounts.map(fetchProfileStats))
    .then((updatedAccounts) => {
      res.body = updatedAccounts;
      next();
    });
};

const updateTwitterStats = async (req, res, next) => {
  // For every account, update statistics in DB
  const accounts = res.body;
  Promise.all(accounts.map(updateMongoTweets))
    .then(() => next());
};

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('cache-control', 'private, max-age=0, no-cache, no-store, must-revalidate');
  res.setHeader('expires', '0');
  res.setHeader('pragma', 'no-cache');
  next();
});

app.use(getTwitterAccounts);

app.get('/profiles', getTwitterProfiles, updateTwitterProfiles, (req, res) => {
  res.sendStatus(200);
});

app.get('/tweets', getTweetStats, updateTwitterStats, (req, res) => {
  res.sendStatus(200);
});

app.get(
  '/',
  getTwitterProfiles,
  updateTwitterProfiles,
  getTweetStats,
  updateTwitterStats,
  (req, res) => {
    res.sendStatus(200);
  },
);

app.listen(port, () => console.log(`Twitter module is listening on port ${port}!`));

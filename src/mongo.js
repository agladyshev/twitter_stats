const { MongoClient } = require("mongodb");
const assert = require("assert");
require("dotenv").config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}${process.env.DB_HOST}/test?retryWrites=true`;

const getTwitterAccounts = async () => {
  // Grab influencers' accounts from DB with twitter name filled
  let accounts;
  try {
    const mongo = await MongoClient.connect(uri);
    const db = mongo.db(process.env.DB_NAME);
    const col = db.collection(process.env.DB_COLLECTION);
    accounts = await col
      .find({ twitter_name: { $gt: "" } })
      .project({ twitter_name: 1, twitter_id: 1 })
      .toArray();
    mongo.close();
  } catch (e) {
    console.error(e);
  }
  return accounts;
};

const updateTwitterProfile = async account => {
  // Update twitter profile info in DB
  try {
    const mongo = await MongoClient.connect(uri);
    const db = mongo.db(process.env.DB_NAME);
    const col = db.collection(process.env.DB_COLLECTION);
    if (account.twitterStatus === "OK") {
      col.updateOne(
        { _id: account._id },
        {
          $set: {
            twitter_id: account.twitterId,
            twitter_name: account.twitterName,
            twitter_followers: account.twitterFollowers,
            tweets: account.tweets,
            twitter_pic: account.twitterPic,
            twitter_status: account.twitterStatus,
            twitter_updated: Date.now()
          }
        },
        (err, result) => {
          assert.equal(err, null);
          assert.equal(1, result.result.n);
        }
      );
    } else {
      col.updateOne(
        { _id: account._id },
        {
          $set: {
            twitter_status: account.twitterStatus,
            twitter_updated: Date.now()
          }
        },
        (err, result) => {
          assert.equal(err, null);
          assert.equal(1, result.result.n);
        }
      );
    }
    mongo.close();
  } catch (e) {
    console.error(e);
  }
};

const updateTwitterStats = async account => {
  // Update twitter stats in DB
  try {
    const mongo = await MongoClient.connect(uri);
    const db = mongo.db(process.env.DB_NAME);
    const col = db.collection(process.env.DB_COLLECTION);
    col.updateOne(
      { _id: account._id },
      {
        $set: {
          twitter_retweets_recent: account.retweetsRecent,
          twitter_favorites_recent: account.favoritesRecent,
          tweets_recent: account.tweetsRecent,
          twitter_cycle: account.twitterCycle,
          twitter_status: account.twitterStatus,
          tweets_updated: Date.now()
        }
      },
      (err, result) => {
        assert.equal(err, null);
        assert.equal(1, result.result.n);
      }
    );
    mongo.close();
  } catch (e) {
    console.error(e);
  }
};

module.exports = {
  getTwitterAccounts,
  updateTwitterProfile,
  updateTwitterStats
};

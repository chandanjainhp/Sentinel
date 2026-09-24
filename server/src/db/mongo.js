import mongoose from 'mongoose';

let isIntentionallyClosed = false;

const connectMongo = async () => {
  try {
    const mongodbUri = process.env.MONGODB_URL;
    if (!mongodbUri) {
      throw new Error('MONGODB_URL environment variable not set');
    }

    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(mongodbUri, options);

    // Extract hostname from connection string for logging
    const urlObj = new URL(mongodbUri);
    console.log(`[Mongo] ✓ Connected to ${urlObj.hostname}`);

    // Register connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('[Mongo] Connected to MongoDB');
      isIntentionallyClosed = false;
    });

    mongoose.connection.on('error', (err) => {
      console.error('[Mongo] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('[Mongo] Disconnected from MongoDB');

      // Attempt reconnection after 5 seconds if not intentional
      if (!isIntentionallyClosed) {
        console.log('[Mongo] Attempting to reconnect in 5 seconds...');
        setTimeout(() => {
          if (!isIntentionallyClosed) {
            mongoose.connect(mongodbUri, options).catch((err) => {
              console.error('[Mongo] Reconnection failed:', err.message);
            });
          }
        }, 5000);
      }
    });

    return mongoose;
  } catch (error) {
    console.error('[Mongo] Connection failed:', error.message);
    throw error;
  }
};

const disconnectMongo = async () => {
  try {
    isIntentionallyClosed = true;
    await mongoose.disconnect();
    console.log('[Mongo] ✓ Disconnected');
  } catch (error) {
    console.error('[Mongo] Disconnection error:', error.message);
    throw error;
  }
};

export { connectMongo, disconnectMongo };

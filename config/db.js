import mongoose from 'mongoose';
import chalk from 'chalk';

const connectDB = async () => {
  console.log(process.env.MONGO_URI);
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.DATABASE_URL ||
      '';

    if (!mongoUri) {
      const errorMessage = 'MongoDB connection string is not defined in environment variables.';
      console.error(chalk.red(`❌ ${errorMessage}`));
      console.error(
        chalk.yellow(
          'ℹ️  Set `MONGO_URI` (preferred) or `MONGODB_URI`/`DATABASE_URL` in your environment or .env file.'
        )
      );
      throw new Error(errorMessage);
    }

    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(chalk.green(`✅ MongoDB Connected: ${conn.connection.host}`));
    
    mongoose.connection.on('error', (err) => {
      console.error(chalk.red(`❌ MongoDB connection error: ${err}`));
    });

    mongoose.connection.on('disconnected', () => {
      console.log(chalk.yellow('⚠️ MongoDB disconnected'));
    });

  } catch (error) {
    console.error(chalk.red(`❌ Error connecting to MongoDB: ${error.message}`));
    process.exit(1);
  }
};

export default connectDB;


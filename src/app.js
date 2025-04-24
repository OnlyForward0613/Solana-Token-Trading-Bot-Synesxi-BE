/* eslint-disable prefer-template */
const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const axios = require('axios');
const { ApolloServer, gql, ApolloError } = require('apollo-server-express');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const DEX_SCREENER_URL = 'https://api.dexscreener.com/latest/dex';

// Axios Configuration
axios.interceptors.response.use(response => {
  return JSON.parse(JSON.stringify(response.data));
}, error => {
  return Promise.reject({
    message: error.message,
    status: error.response?.status,
    data: error.response?.data
  });
});

const app = express();

// Middleware
if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(xss());
app.use(mongoSanitize());
app.use(compression());
app.use(cors({
  origin: [
    'https://solana-token-trading-bot-d-app-three.vercel.app/en',
    'https://solana-token-trading-bot-d-app-three.vercel.app',
    'https://solana-token-trading-bot-synesxi-fe.vercel.app',
    'http://localhost:3001',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.options('*', cors());
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// Schema
const typeDefs = gql`
  type Token {
    address: String!
    name: String!
    symbol: String!
    price: Float!
    priceChange24h: Float!
    liquidity: Float
  }

  type Query {
    tokens(
      search: String
      limit: Int
      offset: Int
      mode: TokenSearchMode = INITIAL_LOAD
    ): [Token!]!
    token(address: String!): Token
  }

  enum TokenSearchMode {
    INITIAL_LOAD
    SEARCH
  }
  
  type Mutation {
    simulateTrade(tokenAddress: String!, amount: Float!, isBuy: Boolean!, slippage: Float!): String
  }
`;

const CHAINS = ['ethereum', 'bsc', 'arbitrum', 'optimism', 'polygon'];

// Resolvers
const resolvers = {
  Query: {
    tokens: async (_, { search, limit = 9, offset = 0, mode }) => {
      try {
        // Initial load - get top traded pairs
        if (mode === 'INITIAL_LOAD') {

          const response1 = await axios.get(`${DEX_SCREENER_URL}/search?q=sol/usdc`);
          const response2 = await axios.get(`${DEX_SCREENER_URL}/search?q=ethereum/usdc`);
          const response3 = await axios.get(`${DEX_SCREENER_URL}/search?q=bsc/usdc`);
          const response4 = await axios.get(`${DEX_SCREENER_URL}/search?q=arbitrum/usdc`);
          const response5 = await axios.get(`${DEX_SCREENER_URL}/search?q=optimism/usdc`);
          const response6 = await axios.get(`${DEX_SCREENER_URL}/search?q=polygon/usdc`);
          let pairs = [];
          pairs.push(response1.pairs[0]);
          pairs.push(response2.pairs[0]);
          pairs.push(response3.pairs[0]);
          pairs.push(response4.pairs[0]);
          pairs.push(response5.pairs[0]);
          pairs.push(response6.pairs[0]);
          // let pairs = response1?.pairs[0] + response2.pairs[0] + response3.pairs[0] + response4.pairs[0] + response5.pairs[0] + response6.pairs[0];
          
          return pairs
            .map(pair => ({
              address: pair.baseToken?.address,
              name: pair.baseToken?.name || 'Unknown',
              symbol: pair.baseToken?.symbol || 'UNK',
              price: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
              priceChange24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : 0,
              liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : 0
            }));
        } else if (search) {
          const response = await axios.get(`${DEX_SCREENER_URL}/search?q=${search}`);
          console.log("hereSearch====", response.pairs)
          const pairs = response?.pairs || [];
          
          return pairs
            .slice(offset, offset + limit)
            .map(pair => ({
              address: pair.baseToken?.address,
              name: pair.baseToken?.name || 'Unknown',
              symbol: pair.baseToken?.symbol || 'UNK',
              price: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
              priceChange24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : 0,
              liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : 0
            }));
        }

        return [];

      } catch (error) {
        console.error('API Error:', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data
        });
        throw new ApolloError('Failed to fetch tokens', 'API_ERROR');
      }
    },
    token: async (_, { address }) => {
      try {
        const response = await axios.get(`${DEX_SCREENER_URL}/tokens/${address}`);
        const pair = response.pairs?.[0];
        
        if (!pair) throw new ApolloError('Token not found', 'NOT_FOUND');

        return {
          id: pair.baseToken.address,
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          price: parseFloat(pair.priceUsd),
          priceChange24h: parseFloat(pair.priceChange?.h24 || 0)
        };
      } catch (error) {
        throw new ApolloError('Failed to fetch token', 'API_ERROR', {
          statusCode: error.status,
          originalError: error.message
        });
      }
    }
  },
  Mutation: {
    simulateTrade: (_, { tokenAddress, amount, isBuy, slippage }) => {
      return `Simulated ${isBuy ? 'Buy' : 'Sell'} of ${amount} ${tokenAddress} with ${slippage}% slippage`;
    },
  },
};


// Apollo Server
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  cache: 'bounded',
  cacheControl: { defaultMaxAge: 300 },
  persistedQueries: false,
  formatError: (err) => {
    const safeError = {
      message: err.message,
      code: err.extensions?.code,
      path: err.path,
    };

    if (config.env === 'development') {
      safeError.extensions = err.extensions;
    }

    return safeError;
  }
});

// Startup
const startServer = async () => {
  await apolloServer.start();
  apolloServer.applyMiddleware({ app, path: '/graphql', cors: false });

  if (config.env === 'production') {
    app.use('/v1/auth', authLimiter);
  }

  app.use('/v1', routes);
  app.use((req, res, next) => next(new ApiError(httpStatus.NOT_FOUND, 'Not found')));
  app.use(errorConverter);
  app.use(errorHandler);

  app.listen(4000, () => {
    console.log('Server running on http://localhost:4000/graphql');
  });
};

startServer();

module.exports = app;

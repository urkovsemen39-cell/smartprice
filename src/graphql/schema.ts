import { makeExecutableSchema } from '@graphql-tools/schema';
import { resolvers } from './resolvers';

const typeDefs = `
  type User {
    id: ID!
    email: String!
    name: String
    role: String!
    emailVerified: Boolean!
    createdAt: String!
  }

  type Product {
    id: ID!
    name: String!
    price: Float!
    marketplace: String!
    url: String!
    image: String
    rating: Float
    reviews: Int
  }

  type SearchResult {
    products: [Product!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  type PriceAlert {
    id: ID!
    productId: String!
    productName: String!
    targetPrice: Float!
    currentPrice: Float!
    marketplace: String!
    active: Boolean!
    createdAt: String!
  }

  type Favorite {
    id: ID!
    productId: String!
    productName: String!
    productPrice: Float!
    marketplace: String!
    addedAt: String!
  }

  type Query {
    me: User
    search(query: String!, limit: Int, page: Int): SearchResult!
    product(id: ID!): Product
    favorites: [Favorite!]!
    priceAlerts: [PriceAlert!]!
    suggestions(query: String!): [String!]!
  }

  type Mutation {
    addFavorite(productId: String!, productName: String!, productPrice: Float!, marketplace: String!): Favorite!
    removeFavorite(id: ID!): Boolean!
    createPriceAlert(productId: String!, productName: String!, targetPrice: Float!, currentPrice: Float!, marketplace: String!): PriceAlert!
    deletePriceAlert(id: ID!): Boolean!
    updateProfile(name: String): User!
  }

  type Subscription {
    priceAlertTriggered: PriceAlert!
    productUpdated(productId: ID!): Product!
  }
`;

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

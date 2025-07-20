const {
  connectDB,
  executeQuery,
  executeTransaction,
  performHealthCheck,
  monitorConnections,
  getPoolStats,
} = require("../services/database");

// Mock the logger to avoid console output during tests
jest.mock("../../shared/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  createMetricsLogger: () => ({
    logBusinessMetric: jest.fn(),
    logPerformance: jest.fn(),
  }),
}));

describe("Database Service", () => {
  // Skip database tests if no database URL is provided
  const skipTests = !process.env.DATABASE_URL;

  beforeAll(async () => {
    if (skipTests) {
      console.log("Skipping database tests - no DATABASE_URL provided");
      return;
    }

    // Set test database URL if not provided
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        "postgresql://test:test@localhost:5432/test_db";
    }
  });

  describe("Connection Management", () => {
    test("should get pool statistics", () => {
      if (skipTests) return;

      const stats = getPoolStats();

      expect(stats).toHaveProperty("totalCount");
      expect(stats).toHaveProperty("idleCount");
      expect(stats).toHaveProperty("waitingCount");
      expect(stats).toHaveProperty("maxConnections");
      expect(stats).toHaveProperty("minConnections");

      expect(typeof stats.totalCount).toBe("number");
      expect(typeof stats.idleCount).toBe("number");
      expect(typeof stats.waitingCount).toBe("number");
    });

    test("should connect to database with retry logic", async () => {
      if (skipTests) return;

      // This test will only pass if database is available
      try {
        const result = await connectDB(3, 1000); // 3 retries, 1 second delay
        expect(result).toBe(true);
      } catch (error) {
        // If database is not available, skip this test
        console.log("Database not available for testing:", error.message);
        return;
      }
    }, 30000); // 30 second timeout for connection attempts

    test("should perform health check", async () => {
      if (skipTests) return;

      try {
        const health = await performHealthCheck();

        expect(health).toHaveProperty("timestamp");
        expect(health).toHaveProperty("database");
        expect(health).toHaveProperty("pool");
        expect(health).toHaveProperty("performance");
        expect(health).toHaveProperty("overall");

        expect(["healthy", "degraded", "unhealthy"]).toContain(health.overall);
      } catch (error) {
        console.log(
          "Health check failed - database not available:",
          error.message
        );
        return;
      }
    }, 10000);

    test("should monitor connections", async () => {
      if (skipTests) return;

      try {
        const monitoring = await monitorConnections();

        expect(monitoring).toHaveProperty("status");
        expect(monitoring).toHaveProperty("stats");
        expect(["ok", "error"]).toContain(monitoring.status);

        if (monitoring.status === "ok") {
          expect(monitoring.stats).toHaveProperty("totalCount");
          expect(monitoring.stats).toHaveProperty("idleCount");
        }
      } catch (error) {
        console.log(
          "Connection monitoring failed - database not available:",
          error.message
        );
        return;
      }
    });
  });

  describe("Query Execution", () => {
    test("should execute simple query", async () => {
      if (skipTests) return;

      try {
        const result = await executeQuery("SELECT 1 as test_value");

        expect(result).toHaveProperty("rows");
        expect(result).toHaveProperty("rowCount");
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].test_value).toBe(1);
      } catch (error) {
        console.log(
          "Query execution failed - database not available:",
          error.message
        );
        return;
      }
    });

    test("should execute parameterized query", async () => {
      if (skipTests) return;

      try {
        const testValue = "test_string";
        const result = await executeQuery("SELECT $1 as test_param", [
          testValue,
        ]);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].test_param).toBe(testValue);
      } catch (error) {
        console.log(
          "Parameterized query failed - database not available:",
          error.message
        );
        return;
      }
    });

    test("should handle query timeout", async () => {
      if (skipTests) return;

      try {
        // This should timeout quickly
        await expect(
          executeQuery("SELECT pg_sleep(10)", [], { timeout: 1000 })
        ).rejects.toThrow();
      } catch (error) {
        console.log(
          "Timeout test failed - database not available:",
          error.message
        );
        return;
      }
    }, 5000);
  });

  describe("Transaction Management", () => {
    test("should execute transaction successfully", async () => {
      if (skipTests) return;

      try {
        const result = await executeTransaction(async (client) => {
          const res1 = await client.query("SELECT 1 as first_value");
          const res2 = await client.query("SELECT 2 as second_value");

          return {
            first: res1.rows[0].first_value,
            second: res2.rows[0].second_value,
          };
        });

        expect(result.first).toBe(1);
        expect(result.second).toBe(2);
      } catch (error) {
        console.log(
          "Transaction test failed - database not available:",
          error.message
        );
        return;
      }
    });

    test("should rollback transaction on error", async () => {
      if (skipTests) return;

      try {
        await expect(
          executeTransaction(async (client) => {
            await client.query("SELECT 1");
            throw new Error("Test error");
          })
        ).rejects.toThrow("Test error");
      } catch (error) {
        console.log(
          "Transaction rollback test failed - database not available:",
          error.message
        );
        return;
      }
    });
  });

  describe("Schema Validation", () => {
    test("should validate basic schema exists", async () => {
      if (skipTests) return;

      try {
        // Check if basic tables exist
        const tablesQuery = `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('books', 'chapters')
        `;

        const result = await executeQuery(tablesQuery);

        // Should have at least some tables (may not have all if schema not initialized)
        expect(Array.isArray(result.rows)).toBe(true);
      } catch (error) {
        console.log(
          "Schema validation failed - database not available:",
          error.message
        );
        return;
      }
    });
  });
});

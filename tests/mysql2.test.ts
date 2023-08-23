import { describe, beforeAll, expect, test, vi, afterAll } from 'vitest';
import request from 'supertest';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import { instrumentMySQL, symbols } from '../src/clients/mysql2';
import OpenAPM from '../src/OpenAPM';

describe('mysql2', () => {
  let mockMysql2, mockConn, mockPool, mockPoolCluster, openapm;

  beforeAll(() => {
    mockMysql2 = {
      createConnection: vi.fn(() => {
        return {
          query: vi.fn((sql, cb) => {
            return {};
          }),
          execute: vi.fn((sql, cb) => {
            return {};
          })
        };
      }),
      createPool: vi.fn(() => {
        return {
          query: vi.fn((sql, cb) => {
            return {};
          }),
          execute: vi.fn((sql, cb) => {
            return {};
          }),
          getConnection: vi.fn((cb) => {
            cb(null, {
              query: vi.fn((sql, cb) => {
                return {};
              }),
              execute: vi.fn((sql, cb) => {
                return {};
              })
            });
          })
        };
      }),
      createPoolCluster: vi.fn(() => {
        return {
          of: vi.fn(() => {
            return {
              query: vi.fn((sql, cb) => {
                return {};
              }),
              execute: vi.fn((sql, cb) => {
                return {};
              }),
              getConnection: vi.fn((cb) => {
                cb(null, {
                  query: vi.fn((sql, cb) => {
                    return {};
                  }),
                  execute: vi.fn((sql, cb) => {
                    return {};
                  })
                });
              })
            };
          })
        };
      })
    };

    openapm = new OpenAPM();
    instrumentMySQL(mockMysql2);
  });

  afterAll(async () => {
    openapm.metricsServer?.close(() => {
      console.log('Closing the metrics server');
    });
  });

  test('Connection', () => {
    mockConn = mockMysql2.createConnection();
    expect(mockConn[symbols.WRAP_CONNECTION]).toBe(true);
  });

  test('Pool', () => {
    mockPool = mockMysql2.createPool();
    expect(mockPool[symbols.WRAP_POOL]).toBe(true);
  });

  test('Pool - getConnection - callback', () => {
    let conn;
    mockPool.getConnection((err, connection) => {
      conn = connection;
    });

    expect(conn[symbols.WRAP_CONNECTION]).toBe(true);
  });

  test('Pool Cluster', () => {
    mockPoolCluster = mockMysql2.createPoolCluster();
    expect(mockPoolCluster[symbols.WRAP_POOL_CLUSTER]).toBe(true);
  });
});

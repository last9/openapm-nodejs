import sinon from 'sinon';
import { describe, beforeAll, expect, test } from 'vitest';
import { instrumentMySQL, symbols } from '../src/clients/mysql2';

describe('mysql2', () => {
  let mockMysql2;

  beforeAll(() => {
    mockMysql2 = {
      createConnection: sinon.stub().returns({}),
      createPool: sinon.stub().returns({
        getConnection: sinon.stub().returns({})
      }),
      createPoolCluster: sinon.stub().returns({
        of: sinon.stub().returns({})
      })
    };

    instrumentMySQL(mockMysql2);
  });

  test('Connection', () => {
    const conn = mockMysql2.createConnection();
    expect(conn[symbols.WRAP_CONNECTION]).toBe(true);
  });

  test('Pool', () => {
    const pool = mockMysql2.createPool();
    expect(pool[symbols.WRAP_POOL]).toBe(true);
  });

  test('Pool Cluster', () => {
    const pool = mockMysql2.createPoolCluster();
    expect(pool[symbols.WRAP_POOL_CLUSTER]).toBe(true);
  });
});

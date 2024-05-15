import { asyncLocalStorage } from '../../../../src/async-local-storage.http';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const storage = asyncLocalStorage.getStore();
  console.log('storage', storage);

  return NextResponse.json({
    status: 200,
    body: {
      message: 'GET method called'
    }
  });
}

import { NextResponse } from 'next/server';
import { getHTTPRequestStore } from '../../../../src/async-local-storage.http';
import { requestAsyncStorage } from 'next/dist/client/components/request-async-storage.external';

export async function GET(request) {
  const store = getHTTPRequestStore();
  const requestStore = requestAsyncStorage.getStore();
  console.log('store', store);
  console.log('requestStore', requestStore);

  return NextResponse.json({
    status: 200,
    body: {
      message: 'GET method called',
      store: typeof store
    }
  });
}

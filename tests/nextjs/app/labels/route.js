import { requestAsyncStorage } from 'next/dist/client/components/request-async-storage.external';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const store = requestAsyncStorage?.getStore();
  store['labels'] = {
    test: 'test'
  };
  console.log('store:', store);

  return NextResponse.json({
    status: 200,
    body: {
      message: 'GET method called'
    }
  });
}

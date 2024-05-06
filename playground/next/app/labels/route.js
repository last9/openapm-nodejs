import { NextResponse } from 'next/server';
import {
  getHTTPRequestStore,
  setOpenAPMLabels
} from '../../../../src/async-local-storage.http';

export async function GET(request) {
  const store = getHTTPRequestStore();
  console.log('store', store);

  return NextResponse.json({
    status: 200,
    body: {
      message: 'GET method called',
      store: typeof store
    }
  });
}

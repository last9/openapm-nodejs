import { NextResponse } from 'next/server';
import { setOpenAPMLabels } from '../../../../src/async-local-storage.http';

export async function GET(request) {
  setOpenAPMLabels({
    slug: 'route'
  });

  return NextResponse.json({
    status: 200,
    body: {
      message: 'GET method called'
    }
  });
}

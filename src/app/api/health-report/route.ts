import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  // Local health files are available only through a loopback deployment.
  const host=request.nextUrl.hostname;
  if(!['localhost','127.0.0.1','[::1]','::1'].includes(host))return NextResponse.json({error:'Local report requires localhost'},{status:403});
  const origin=request.headers.get('origin');
  if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:'Cross-origin request denied'},{status:403});
  try{
    const report=JSON.parse(await readFile(path.join(process.cwd(),'analysis/health_report.json'),'utf8'));
    if(!report.metrics||!Array.isArray(report.history))throw new Error('Invalid report');
    return NextResponse.json(report,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const missing=(error as NodeJS.ErrnoException).code==='ENOENT';
    return NextResponse.json({error:missing?'No terminal report yet':'Could not read terminal report'},{status:missing?404:500});
  }
}

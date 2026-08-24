'use client';

import {useEffect} from 'react';

export default function AdminPage(){
  useEffect(()=>{location.replace('/dashboard/settings/access')},[]);
  return <main className="auth-page"><div className="muted">Opening Employee Access…</div></main>;
}

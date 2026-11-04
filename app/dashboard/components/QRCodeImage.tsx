// Local QR image generator. Based on qrcode-generator by Kazuhiko Arase.
// MIT License: see ./qrcode-generator.LICENSE
'use client';

import {useMemo} from 'react';
import qrcode from './vendor/qrcode-generator.mjs';

export default function QRCodeImage({value,alt,size=190}:{value:string;alt:string;size?:number}){
 const source=useMemo(()=>{
  if(!value)return '';
  const qr=qrcode(0,'M');
  qr.addData(value,'Byte');
  qr.make();
  const svg=qr.createSvgTag({cellSize:5,margin:4,scalable:true});
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 },[value]);
 if(!source)return <span aria-label={alt}>QR unavailable</span>;
 return <img src={source} alt={alt} width={size} height={size} style={{display:'block',width:size,height:size,maxWidth:'100%',objectFit:'contain'}}/>;
}

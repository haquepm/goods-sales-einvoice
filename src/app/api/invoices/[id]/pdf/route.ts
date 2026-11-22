import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// PDFKit snapshot payloads are database JSON values with dynamic keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// PDFKit snapshot payloads are database JSON values with dynamic keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow=Record<string,any>;
const money=(v:unknown)=>Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const safe=(v:unknown)=>String(v??"").trim();
const address=(v:unknown)=>{
 if(!v)return "";
 if(typeof v==="string")return v;
 if(typeof v!=="object")return String(v);
 const a=v as AnyRow;
 return [a.line1||a.address_line_1,a.line2||a.address_line_2,a.city,a.district,a.state||a.state_name,a.postal_code||a.pincode].filter(Boolean).join(", ");
};
const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function underThousand(n:number):string{
 let out="";
 if(n>=100){out+=ones[Math.floor(n/100)]+" Hundred";n%=100;if(n)out+=" ";}
 if(n>=20){out+=tens[Math.floor(n/10)];if(n%10)out+=" "+ones[n%10];}
 else if(n)out+=ones[n];
 return out;
}
function numberWords(value:number):string{
 let n=Math.floor(Math.abs(value));if(!n)return "Zero";
 const parts:[number,string][]=[[10000000,"Crore"],[100000,"Lakh"],[1000,"Thousand"],[1,""]];
 const out:string[]=[];
 for(const [unit,label] of parts){if(n>=unit){const q=Math.floor(n/unit);out.push(underThousand(q)+(label?" "+label:""));n%=unit;}}
 return out.join(" ");
}
function inrWords(v:number){const whole=Math.floor(Math.abs(v));const paise=Math.round((Math.abs(v)-whole)*100);return "INR "+numberWords(whole)+" Rupees"+(paise?" and "+numberWords(paise)+" Paise":"")+" Only";}
function groupSummary(items:AnyRow[]){
 const m=new Map<string,AnyRow>();
 for(const x of items){const key=x.hsn_code+"|"+Number(x.gst_rate);const v=m.get(key)||{hsn:x.hsn_code,rate:Number(x.gst_rate),taxable:0,cgst:0,sgst:0,igst:0};v.taxable+=Number(x.taxable_value);v.cgst+=Number(x.cgst_amount);v.sgst+=Number(x.sgst_amount);v.igst+=Number(x.igst_amount);m.set(key,v);}
 return [...m.values()];
}

export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const supabase=await createClient();
 const {data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub)return NextResponse.json({error:"Authentication required"},{status:401});
 const {data:businesses,error:businessError}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
 if(businessError||!businesses?.[0])return NextResponse.json({error:"Business workspace not found"},{status:404});
 const businessId=businesses[0].id;
 const {data:invoice,error}=await supabase.from("goods_invoices").select("*").eq("id",id).eq("business_id",businessId).maybeSingle();
 if(error||!invoice)return NextResponse.json({error:"Invoice not found"},{status:404});
 const [{data:items},{data:bank}]=await Promise.all([
  supabase.from("goods_invoice_items").select("*").eq("invoice_id",id).order("line_number"),
  supabase.from("business_bank_accounts").select("account_holder_name,bank_name,account_number,ifsc_code,branch_name").eq("business_id",businessId).eq("is_default",true).maybeSingle()
 ]);
 const seller=(invoice.seller_snapshot||{}) as AnyRow;
 const buyer=(invoice.buyer_snapshot||{}) as AnyRow;
 const consignee=(invoice.delivery_details||{}) as AnyRow;
 const transport=(invoice.transport_details||{}) as AnyRow;
 const rows=items||[];
 let qrBuffer:Buffer|undefined;
 if(invoice.status==="irp_registered"&&invoice.signed_qr_code){
  try{const qr=await QRCode.toDataURL(invoice.signed_qr_code,{errorCorrectionLevel:"M",margin:1,width:180});qrBuffer=Buffer.from(qr.split(",")[1],"base64");}catch{/* malformed provider QR is omitted */}
 }
 const doc=new PDFDocument({size:"A4",margin:27,autoFirstPage:true,bufferPages:true,info:{Title:"Tax Invoice "+invoice.invoice_number,Author:safe(seller.legal_name)||"Goods Sales e-Invoice",Subject:"Goods sales tax invoice"}});
 const chunks:Buffer[]=[];
 const pdfPromise=new Promise<Buffer>((resolve,reject)=>{doc.on("data",(c:Buffer)=>chunks.push(c));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
 const L=27,R=568,W=R-L;let y=27;
 const line=(yy:number,x1=L,x2=R)=>{doc.moveTo(x1,yy).lineTo(x2,yy).lineWidth(.45).strokeColor("#555555").stroke();};
 const txt=(s:unknown,x:number,yy:number,w:number,opts:AnyRow={})=>doc.font(opts.bold?"Helvetica-Bold":"Helvetica").fontSize(opts.size||7.1).fillColor("#111111").text(safe(s),x,yy,{width:w,align:opts.align||"left",lineGap:0,...opts});
 const box=(x:number,yy:number,w:number,h:number)=>doc.rect(x,yy,w,h).lineWidth(.45).strokeColor("#555555").stroke();
 const newPage=()=>{doc.addPage({size:"A4",margin:27});y=27;header(false);};
 const header=(first:boolean)=>{
  txt(["issued","irp_registered"].includes(invoice.status)?"TAX INVOICE":"DRAFT INVOICE",L,y,W,{bold:true,size:11,align:"center"});y+=17;
  if(first&&qrBuffer)doc.image(qrBuffer,R-67,24,{fit:[62,62]});
  if(invoice.generated_irn){txt("IRN: "+invoice.generated_irn,L,y,W-(first&&qrBuffer?75:0),{size:6.2});y+=10;}
  if(invoice.status==="irp_registered"&&invoice.irn){txt("IRP Registration IRN: "+invoice.irn,L,y,W-(first&&qrBuffer?75:0),{size:6.2});y+=10;txt("Ack No.: "+safe(invoice.acknowledgement_number)+"   Ack Date: "+(invoice.acknowledgement_date?new Date(invoice.acknowledgement_date).toLocaleString("en-IN"):""),L,y,W-(first&&qrBuffer?75:0),{size:6.2});y+=12;}
  line(y);y+=5;
  const top=y;
  box(L,top,W,first?72:45);
  txt(seller.legal_name,L+6,top+5,245,{bold:true,size:8.5});
  txt(address(seller),L+6,top+18,245,{size:6.8});
  txt("GSTIN/UIN: "+safe(seller.gstin),L+6,top+43,245,{bold:true,size:6.8});
  txt("State: "+safe(seller.state_name)+"  Code: "+safe(seller.state_code),L+6,top+54,245,{size:6.8});
  const metaX=L+260;
  txt("Invoice No.",metaX,top+5,90,{bold:true,size:6.5});txt(invoice.invoice_number,metaX+95,top+5,145,{bold:true,size:7});
  txt("Dated",metaX,top+19,90,{bold:true,size:6.5});txt(new Date(invoice.invoice_date+"T00:00:00").toLocaleDateString("en-IN"),metaX+95,top+19,145,{size:7});
  txt("Financial Year",metaX,top+33,90,{bold:true,size:6.5});txt(invoice.financial_year,metaX+95,top+33,145,{size:7});
  txt("E-Way Bill No.",metaX,top+47,90,{bold:true,size:6.5});txt(transport.eway_bill_number||"—",metaX+95,top+47,145,{size:7});
  if(first){txt("E-Mail: "+safe(seller.email)+"   Phone: "+safe(seller.phone),L+6,top+63,245,{size:6.3});}
  y=top+(first?72:45);
 };
 const section=(title:string,content:string,x:number,yy:number,w:number,h:number)=>{
  box(x,yy,w,h);txt(title.toUpperCase(),x+5,yy+5,w-10,{bold:true,size:6.2});txt(content,x+5,yy+16,w-10,{size:6.6,lineGap:1});
 };
 header(true);
 const partyY=y;const leftW=260;const rightW=W-leftW;
 const bill= [safe(buyer.legal_name),address(buyer.billing_address),buyer.gstin?"GSTIN/UIN: "+buyer.gstin:"Unregistered customer","State: "+safe(buyer.state_code), "Place of Supply: "+safe(invoice.place_of_supply_state_code)].filter(Boolean).join("\n");
 const ship= [safe(consignee.name||buyer.legal_name),address(consignee.address||buyer.shipping_address),consignee.gstin?"GSTIN/UIN: "+consignee.gstin:"","Destination: "+safe(consignee.destination||transport.destination)].filter(Boolean).join("\n");
 const partyH=84;
 section("Buyer (Bill to)",bill,L,partyY,leftW,partyH);
 section("Consignee (Ship to)",ship,L+leftW,partyY,rightW,partyH);
 y=partyY+partyH;
 const trH=52;section("Dispatch / Transport",["Vehicle No.: "+safe(transport.vehicle_number),"Dispatched through: "+safe(transport.dispatched_through),"LR/RR No.: "+safe(transport.lr_number),"Terms of Delivery: "+safe(transport.terms)].join("\n"),L,y,W,trH);y+=trH;
 const tableHead=24;const cols=[22,190,48,57,58,62,55,49];const labels=["Sl","Description of Goods","HSN","Quantity","Rate","Taxable","GST %","Amount"];
 const drawTableHead=()=>{let x=L;box(L,y,W,tableHead);for(let i=0;i<cols.length;i++){txt(labels[i],x+3,y+7,cols[i]-6,{bold:true,size:6,align:i>=3?"right":"left"});x+=cols[i];if(i<cols.length-1)doc.moveTo(x,y).lineTo(x,y+tableHead).lineWidth(.35).strokeColor("#777").stroke();}y+=tableHead;};
 drawTableHead();
 for(const item of rows){
  const desc=safe(item.description);doc.font("Helvetica").fontSize(6.5);const h=Math.max(23,doc.heightOfString(desc,{width:cols[1]-8})+8);
  if(y+h>760){newPage();drawTableHead();}
  let x=L;const vals=[String(item.line_number),desc,safe(item.hsn_code),Number(item.quantity).toLocaleString("en-IN")+" "+safe(item.unit_code),money(item.unit_rate),money(item.taxable_value),Number(item.gst_rate).toFixed(2),money(item.line_total)];
  box(L,y,W,h);for(let i=0;i<vals.length;i++){txt(vals[i],x+3,y+5,cols[i]-6,{size:6.3,align:i>=3?"right":"left"});x+=cols[i];if(i<cols.length-1)doc.moveTo(x,y).lineTo(x,y+h).lineWidth(.3).strokeColor("#aaa").stroke();}y+=h;
 }
 const totalsH=25;if(y+totalsH>760){newPage();drawTableHead();}
 box(L,y,W,totalsH);txt("Total",L+5,y+8,cols[0]+cols[1]+cols[2]-10,{bold:true,size:7});
 txt(rows.reduce((s,x)=>s+Number(x.quantity),0).toLocaleString("en-IN"),L+cols[0]+cols[1]+cols[2]+3,y+8,cols[3]-6,{bold:true,size:7,align:"right"});
 txt("INR "+money(invoice.grand_total),R-112,y+8,106,{bold:true,size:7,align:"right"});y+=totalsH+8;
 const amountLine="Amount Chargeable (in words): "+inrWords(Number(invoice.grand_total));
 doc.font("Helvetica").fontSize(6.8);const wordH=doc.heightOfString(amountLine,{width:W-12})+12;
 if(y+wordH+145>770){newPage();}
 box(L,y,W,wordH);txt(amountLine,L+6,y+6,W-12,{size:6.8,bold:true});y+=wordH+7;
 const summaries=groupSummary(rows);const sumH=18+summaries.length*17;
 if(y+sumH+135>770){newPage();}
 txt("HSN / SAC WISE TAX SUMMARY",L,y,W,{bold:true,size:7});y+=13;
 const sx=[L,L+95,L+185,L+240,L+295,L+350,L+405,L+470,R];
 const sh=["HSN/SAC","Taxable Value","CGST Rate","CGST Amt","SGST Rate","SGST Amt","IGST Rate","IGST Amt"];
 const drawSumRow=(vals:string[],bold=false)=>{box(L,y,W,17);for(let i=0;i<vals.length;i++){txt(vals[i],sx[i]+3,y+5,sx[i+1]-sx[i]-6,{size:5.8,bold,align:i===0?"left":"right"});}y+=17;};
 drawSumRow(sh,true);
 for(const s of summaries){drawSumRow([s.hsn,money(s.taxable),s.igst?"0.00%":(s.rate/2).toFixed(2)+"%",money(s.cgst),s.igst?"0.00%":(s.rate/2).toFixed(2)+"%",money(s.sgst),s.igst?s.rate.toFixed(2)+"%":"0.00%",money(s.igst)]);}
 drawSumRow(["Total",money(Number(invoice.subtotal)), "",money(Number(invoice.cgst_total)),"",money(Number(invoice.sgst_total)),"",money(Number(invoice.igst_total))],true);
 y+=6;
 const taxWords="Tax Amount (in words): "+inrWords(Number(invoice.cgst_total)+Number(invoice.sgst_total)+Number(invoice.igst_total)+Number(invoice.cess_total));
 txt(taxWords,L,y,W,{size:6.4});y+=14;
 const bankText=bank?[ "A/c Holder: "+bank.account_holder_name,"Bank: "+bank.bank_name,"A/c No.: "+bank.account_number,"Branch & IFSC: "+[bank.branch_name,bank.ifsc_code].filter(Boolean).join(" / ")].join("\n"):"Bank details not configured";
 const remarks=safe((invoice.delivery_details as AnyRow)?.remarks);
 const footerH=82;
 if(y+footerH>785){newPage();}
 const footY=y;section("Remarks / Declaration",["Remarks: "+remarks,"We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."].join("\n"),L,footY,300,footerH);
 section("Company's Bank Details",bankText,L+300,footY,W-300,footerH);
 y=footY+footerH+8;
 txt("For "+safe(seller.legal_name),L+W-175,y,170,{bold:true,size:7,align:"right"});y+=27;
 txt("Authorised Signatory",L+W-175,y,170,{size:7,align:"right"});
 if(invoice.status==="irp_registered"&&invoice.signed_qr_code){
  try{const qr=await QRCode.toDataURL(invoice.signed_qr_code,{errorCorrectionLevel:"M",margin:1,width:180});const b64=qr.split(",")[1];const qrBuffer=Buffer.from(b64,"base64");if(y+95>790){newPage();}doc.image(qrBuffer,L,y+4,{fit:[76,76]});txt("IRP signed QR code",L+82,y+10,160,{size:6.5,bold:true});}catch{/* keep PDF available even if a provider QR payload is malformed */}
 }
 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.font("Helvetica").fontSize(6).fillColor("#555").text("This is a computer generated invoice",L,814,{width:W,align:"center"});doc.text("Page "+(i+1)+" of "+range.count,R-75,814,{width:75,align:"right"});}
 doc.end();
 const pdf=await pdfPromise;
 return new NextResponse(new Uint8Array(pdf),{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+invoice.invoice_number.replace(/[^a-zA-Z0-9._-]/g,"_")+'.pdf"',"Cache-Control":"private, no-store"}});
}

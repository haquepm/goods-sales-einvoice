import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type R=Record<string, any>;
const s=(v:unknown)=>String(v??"").trim();
const n=(v:unknown)=>Number(v||0);
const m=(v:unknown)=>n(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const d=(v:unknown)=>{if(!v)return "";const x=new Date(String(v).length===10?String(v)+"T00:00:00":String(v));return isNaN(x.getTime())?s(v):x.toLocaleDateString("en-IN");};
const a=(v:unknown)=>{if(!v)return "";if(typeof v==="string")return v;if(typeof v!=="object")return s(v);const x=v as R;return [x.line1||x.address_line_1,x.line2||x.address_line_2,x.city,x.district,x.state||x.state_name,x.postal_code||x.pincode].filter(Boolean).map(s).join(", ");};
const one=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const ten=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function under(x:number):string{let z="",v=Math.floor(x);if(v>=100){z=one[Math.floor(v/100)]+" Hundred";v%=100;if(v)z+=" ";}if(v>=20)z+=ten[Math.floor(v/10)]+(v%10?" "+one[v%10]:"");else if(v)z+=one[v];return z;}
function words(v:number):string{let x=Math.floor(Math.abs(v));if(!x)return "Zero";const out:string[]=[];for(const [u,l] of [[10000000,"Crore"],[100000,"Lakh"],[1000,"Thousand"],[1,""]] as [number,string][]){if(x>=u){const q=Math.floor(x/u);out.push(under(q)+(l?" "+l:""));x%=u;}}return out.join(" ");}
const inr=(v:number)=>"Indian Rupee "+words(v)+" Only";
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,supabase=await createClient(),{data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub)return NextResponse.json({error:"Authentication required"},{status:401});
 const {data:bs}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
 if(!bs?.[0])return NextResponse.json({error:"Business workspace not found"},{status:404});
 const bid=bs[0].id,{data:inv}=await supabase.from("goods_invoices").select("*").eq("id",id).eq("business_id",bid).maybeSingle();
 if(!inv)return NextResponse.json({error:"Invoice not found"},{status:404});
 const [{data:items},{data:bank}]=await Promise.all([
  supabase.from("goods_invoice_items").select("*").eq("invoice_id",id).order("line_number"),
  supabase.from("business_bank_accounts").select("account_holder_name,bank_name,account_number,ifsc_code,branch_name").eq("business_id",bid).eq("is_default",true).maybeSingle()
 ]);
 const seller=(inv.seller_snapshot||{}) as R,buyer=(inv.buyer_snapshot||{}) as R,del=(inv.delivery_details||{}) as R,tr=(inv.transport_details||{}) as R,rows=(items||[]) as R[];
 const doc=new PDFDocument({size:"A4",margin:27,bufferPages:true,info:{Title:"Tax Invoice "+inv.invoice_number}});
 const chunks:Buffer[]=[];const promise=new Promise<Buffer>((res,rej)=>{doc.on("data",(b:Buffer)=>chunks.push(b));doc.on("end",()=>res(Buffer.concat(chunks)));doc.on("error",rej);});
 const L=27,R=568,W=541;let y=24;
 const line=(yy:number,x1=L,x2=R)=>doc.moveTo(x1,yy).lineTo(x2,yy).lineWidth(.4).strokeColor("#333").stroke();
 const t=(v:unknown,x:number,yy:number,w:number,o:R={})=>doc.font(o.bold?"Helvetica-Bold":"Helvetica").fontSize(o.size||6).fillColor("#111").text(s(v),x,yy,{width:w,align:o.align||"left",lineGap:0});
 const rect=(x:number,yy:number,w:number,h:number)=>doc.rect(x,yy,w,h).lineWidth(.4).strokeColor("#555").stroke();
 const cell=(v:unknown,x:number,yy:number,w:number,o:R={})=>t(v,x+3,yy+3,w-6,o);
 let qr:Buffer|undefined;try{qr=Buffer.from((await QRCode.toDataURL(s(inv.generated_irn||inv.invoice_number),{margin:1,width:180})).split(",")[1],"base64");}catch{}
 t(inv.status==="draft"?"Draft Tax Invoice":"Tax Invoice",L,y,W,{bold:true,size:10,align:"center"});
 t("Invoice Reference QR",R-96,y,92,{size:5,align:"center"});if(qr)doc.image(qr,R-88,y+10,{fit:[76,76]});y+=17;
 t("IRN / Invoice Reference:",L+4,y,105,{bold:true,size:5.8});t(inv.generated_irn,L+110,y,W-210,{size:5.5});y+=10;
 if(inv.status==="irp_registered"&&inv.irn){t("IRP IRN: "+inv.irn,L+4,y,280);t("Ack No.: "+s(inv.acknowledgement_number)+"  Ack Date: "+d(inv.acknowledgement_date),L+285,y,270);y+=11;}
 const left=236,right=W-left,top=y,meta=[
 ["Invoice No.",inv.invoice_number,"Dated",d(inv.invoice_date)],
 ["Delivery Note",del.delivery_note,"Mode/Terms of Payment",del.payment_terms],
 ["Reference No. & Date",del.reference_number,"Other References",del.other_references],
 ["Buyer's Order No.",del.buyer_order_number,"Dated",d(del.buyer_order_date)],
 ["Dispatch Doc No.",tr.dispatch_doc_number,"Delivery Note Date",d(tr.delivery_note_date)],
 ["Dispatched through",tr.dispatched_through,"Destination",tr.destination],
 ["Bill of Lading/LR-RR No.",tr.lr_number,"Motor Vehicle No.",tr.vehicle_number],
 ["Terms of Delivery",tr.terms,"Place of Supply",inv.place_of_supply_state_code]
 ];
 rect(L,top,left,66);rect(L+left,top,right,112);
 t(s(seller.legal_name),L+4,top+4,left-8,{bold:true,size:7});
 [a(seller.address),seller.gstin?"GSTIN/UIN: "+seller.gstin:"",seller.state_name?"State Name: "+seller.state_name+"  Code: "+s(seller.state_code):"",seller.email?"E-Mail: "+seller.email:"",seller.phone?"Phone: "+seller.phone:""].filter(Boolean).forEach((v,i)=>t(v,L+4,top+15+i*9,left-8,{size:5.7}));
 meta.forEach((r,i)=>{const yy=top+i*14;if(i)line(yy,L+left,R);t(r[0],L+left+4,yy+3,91,{size:5.2});t(r[1],L+left+97,yy+3,77,{size:5.4,bold:true});t(r[2],L+left+178,yy+3,76,{size:5.2});t(r[3],L+left+256,yy+3,right-260,{size:5.4});});
 y=top+112;
 const partyH=55;rect(L,y,left,partyH);rect(L+left,y,right,partyH);
 t("Consignee (Ship to)",L+4,y+3,left-8,{bold:true,size:5.5});
 [s(del.name||buyer.legal_name),a(del.address||buyer.shipping_address),del.gstin?"GSTIN/UIN: "+del.gstin:"",buyer.state_code?"State Name: "+s(buyer.state_name)+"  Code: "+s(buyer.state_code):""].filter(Boolean).forEach((v,i)=>t(v,L+4,y+12+i*8,left-8,{size:5.5,bold:i===0}));
 t("Buyer (Bill to)",L+left+4,y+3,right-8,{bold:true,size:5.5});
 [s(buyer.legal_name),a(buyer.billing_address),buyer.gstin?"GSTIN/UIN: "+buyer.gstin:"",buyer.state_code?"State Name: "+s(buyer.state_name)+"  Code: "+s(buyer.state_code):""].filter(Boolean).forEach((v,i)=>t(v,L+left+4,y+12+i*8,right-8,{size:5.5,bold:i===0}));
 y+=partyH;
 const widths=[22,210,48,55,58,34,82],heads=["Sl","Description of Goods","HSN/SAC","Quantity","Rate","per","Amount"];
 const drawHead=()=>{rect(L,y,W,18);let x=L;heads.forEach((v,i)=>{cell(v,x,y,widths[i],{bold:true,size:5.5,align:i>=3?"right":"left"});x+=widths[i];});y+=18;};drawHead();
 rows.forEach((it,i)=>{const desc=s(it.description);doc.font("Helvetica").fontSize(5.8);const h=Math.max(17,doc.heightOfString(desc,{width:widths[1]-8})+7);if(y+h+24>760){doc.addPage({size:"A4",margin:27});y=25;drawHead();}rect(L,y,W,h);let x=L;[String(i+1),desc,s(it.hsn_code),m(it.quantity),m(it.unit_rate),s(it.unit_code),m(it.taxable_value)].forEach((v,j)=>{cell(v,x,y,widths[j],{size:5.7,align:j>=3?"right":"left"});x+=widths[j];});y+=h;
 const rate=n(it.gst_rate),half=rate/2,taxes=n(it.igst_amount)>0?[["IGST @"+rate.toFixed(2)+"% OUTPUT TAX",n(it.igst_amount),rate]]:[["CGST @"+half.toFixed(2)+"% OUTPUT TAX",n(it.cgst_amount),half],["SGST @"+half.toFixed(2)+"% OUTPUT TAX",n(it.sgst_amount),half]];
 taxes.forEach(([label,amt,rt])=>{rect(L,y,W,12);t(label,L+285,y+3,165,{bold:true,size:5.3,align:"right"});t(Number(rt).toFixed(2)+" %",R-120,y+3,36,{size:5.3,align:"right"});t(m(amt),R-78,y+3,72,{bold:true,size:5.5,align:"right"});y+=12;});
 });
 rect(L,y,W,18);t("Total",L+282,y+4,100,{bold:true,size:6});t(rows.reduce((z,it)=>z+n(it.quantity),0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}),L+280,y+4,90,{bold:true,size:5.8,align:"right"});t("₹ "+m(inv.grand_total),R-85,y+4,79,{bold:true,size:6,align:"right"});y+=18;
 rect(L,y,W,22);t("Amount Chargeable (in words):",L+4,y+3,150,{size:5.4});t(inr(n(inv.grand_total)),L+4,y+11,W-8,{bold:true,size:5.7});y+=22;
 const groups=new Map<string,R>();rows.forEach(it=>{const k=s(it.hsn_code)+"|"+n(it.gst_rate),g=groups.get(k)||{hsn:s(it.hsn_code),rate:n(it.gst_rate),taxable:0,cgst:0,sgst:0,igst:0};g.taxable+=n(it.taxable_value);g.cgst+=n(it.cgst_amount);g.sgst+=n(it.sgst_amount);g.igst+=n(it.igst_amount);groups.set(k,g);});
 t("HSN/SAC",L,y,70,{bold:true,size:5.5});t("Taxable Value",L+75,y,70,{bold:true,size:5.5,align:"right"});t("CGST",L+150,y,85,{bold:true,size:5.5,align:"right"});t("SGST/UTGST",L+245,y,95,{bold:true,size:5.5,align:"right"});t("IGST",L+350,y,75,{bold:true,size:5.5,align:"right"});t("Total Tax",L+430,y,105,{bold:true,size:5.5,align:"right"});y+=10;line(y);y+=3;
 for(const g of groups.values()){t(g.hsn,L,y,70,{size:5.3});t(m(g.taxable),L+75,y,70,{size:5.3,align:"right"});t(m(g.cgst),L+150,y,85,{size:5.3,align:"right"});t(m(g.sgst),L+245,y,95,{size:5.3,align:"right"});t(m(g.igst),L+350,y,75,{size:5.3,align:"right"});t(m(g.cgst+g.sgst+g.igst),L+430,y,105,{size:5.3,align:"right"});y+=11;}
 line(y);y+=5;t("Tax Amount (in words):",L+3,y,112,{size:5.4});t(inr(n(inv.cgst_total)+n(inv.sgst_total)+n(inv.igst_total)+n(inv.cess_total)),L+116,y,W-120,{bold:true,size:5.5});y+=15;
 if(y+80>785){doc.addPage({size:"A4",margin:27});y=25;}
 rect(L,y,300,65);rect(L+300,y,W-300,65);t("Declaration",L+4,y+4,290,{bold:true,size:5.5});t("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",L+4,y+14,290,{size:5.2});
 t("Company's Bank Details",L+304,y+4,W-308,{bold:true,size:5.5});[bank?"Bank Name: "+s(bank.bank_name):"",bank?"A/c No.: "+s(bank.account_number):"",bank?"Branch & IFSC Code: "+[s(bank.branch_name),s(bank.ifsc_code)].filter(Boolean).join(" / "):"Bank details not configured"].filter(Boolean).forEach((v,i)=>t(v,L+304,y+15+i*10,W-308,{size:5.2}));
 t("For "+s(seller.legal_name),R-175,y+68,170,{bold:true,size:5.8,align:"right"});t("Authorised Signatory",R-175,y+91,170,{size:5.5,align:"right"});line(y+107);t("This is a Computer Generated Invoice",L,y+112,W,{size:5.2,align:"center"});
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.font("Helvetica").fontSize(5).fillColor("#555").text("Page "+(i+1)+" of "+range.count,L,814,{width:W,align:"right"});}
 doc.end();const pdf=await promise;
 return new NextResponse(new Uint8Array(pdf),{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+s(inv.invoice_number).replace(/[^a-zA-Z0-9._-]/g,"_")+'.pdf"',"Cache-Control":"private, no-store"}});
}

"use server";

import ExcelJS from "exceljs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const formSchema=z.object({
 customer_id:z.string().uuid(),
 product_12mm:z.string().uuid(),
 product_20mm:z.string().uuid(),
 product_msand:z.string().uuid(),
});
const clean=(v:unknown)=>String(v??"").trim();
const headerKey=(v:unknown)=>clean(v).toUpperCase().replace(/[^A-Z0-9]/g,"");
function excelDate(v:unknown):string|null{
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
 if(typeof v==="number"&&v>20000&&v<80000){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10);}
 const s=clean(v);if(!s)return null;
 const iso=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);if(iso)return iso[1]+"-"+iso[2].padStart(2,"0")+"-"+iso[3].padStart(2,"0");
 const dmy=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(dmy)return dmy[3]+"-"+dmy[2].padStart(2,"0")+"-"+dmy[1].padStart(2,"0");
 const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
async function context(){
 const supabase=await createClient();const {data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub)redirect("/login");
 const {data:businesses}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
 if(!businesses?.[0])redirect("/onboarding");
 return {supabase,businessId:businesses[0].id,userId:claims.claims.sub as string};
}
export async function previewExcelImport(formData:FormData){
 const parsed=formSchema.safeParse(Object.fromEntries(formData));
 const file=formData.get("file");
 if(!parsed.success||!(file instanceof File)||file.size===0||file.size>10*1024*1024)redirect("/imports?error=Choose%20a%20valid%20Excel%20file%20(up%20to%2010%20MB)");
 const {supabase,businessId,userId}=await context();
 const [customer,products]=await Promise.all([
  supabase.from("customers").select("id").eq("business_id",businessId).eq("id",parsed.data.customer_id).eq("is_active",true).maybeSingle(),
  supabase.from("products").select("id").eq("business_id",businessId).eq("is_active",true).in("id",[parsed.data.product_12mm,parsed.data.product_20mm,parsed.data.product_msand])
 ]);
 if(!customer||!customer.data||products.error||products.data?.length!==3)redirect("/imports?error=Select%20an%20active%20customer%20and%20three%20valid%20products");
 const workbook=new ExcelJS.Workbook();
 try{await workbook.xlsx.load(await file.arrayBuffer() as unknown as Parameters<typeof workbook.xlsx.load>[0]);}catch{redirect("/imports?error=Unable%20to%20read%20this%20Excel%20file");}
 const sheet=workbook.worksheets[0];if(!sheet||sheet.rowCount<2)redirect("/imports?error=The%20first%20worksheet%20has%20no%20data");
 const headers=new Map<string,number>();
 sheet.getRow(1).eachCell((cell,col)=>headers.set(headerKey(cell.value),col));
 const find=(...keys:string[])=>keys.map(k=>headers.get(k)).find(Boolean);
 const cDate=find("DATE");const cSupplier=find("NAMEOFSUPPLIER","SUPPLIER","MATERIALSUPPLIER");const cVehicle=find("VEHICLENUMBER","VEHICLENO","VEHICLE");const cUnit=find("UNIT");
 const c12=find("12MM");const c20=find("20MM");const cSand=find("MSAND");
 if(!cDate||!cSupplier||!cVehicle||!c12||!c20||!cSand)redirect("/imports?error=Required%20columns%20not%20found.%20Use%20DATE,%20NAME%20OF%20SUPPLIER,%20VEHICLE%20NUMBER,%2012%20MM,%2020%20MM,%20M-SAND");
 const mappings=[{key:"12 MM",product_id:parsed.data.product_12mm,col:c12},{key:"20 MM",product_id:parsed.data.product_20mm,col:c20},{key:"M-SAND",product_id:parsed.data.product_msand,col:cSand}];
 type ImportRow={source_row_number:number;source_date:string|null;material_supplier:string;vehicle_number:string;unit_code:string;materials:Record<string,{product_id:string;quantity:number}>;validation_status:"eligible"|"skipped"|"error";validation_message:string};
 const rows:ImportRow[]=[];let eligible=0,skipped=0,errors=0;
 for(let rowNo=2;rowNo<=sheet.rowCount;rowNo++){
  const row=sheet.getRow(rowNo);if(row.cellCount===0)continue;
  const raw=[c12,c20,cSand].map(col=>row.getCell(col).value);
  const parsedQty=raw.map(v=>clean(v)===""?0:Number(v));
  const quantities=parsedQty;
  const hasQty=quantities.some(v=>v>0);
  if(!hasQty){rows.push({source_row_number:rowNo,source_date:excelDate(row.getCell(cDate).value),material_supplier:clean(row.getCell(cSupplier).value),vehicle_number:clean(row.getCell(cVehicle).value),unit_code:clean(row.getCell(cUnit||1).value)||"TON",materials:{},validation_status:"skipped",validation_message:"All material quantities are zero or blank."});skipped++;continue;}
  const date=excelDate(row.getCell(cDate).value);
  if(!date||quantities.some(v=>v<0)||quantities.some(v=>!Number.isFinite(v))){rows.push({source_row_number:rowNo,source_date:date,material_supplier:clean(row.getCell(cSupplier).value),vehicle_number:clean(row.getCell(cVehicle).value),unit_code:clean(row.getCell(cUnit||1).value)||"TON",materials:{},validation_status:"error",validation_message:"Invalid date or negative/invalid quantity."});errors++;continue;}
  const materials:Record<string,{product_id:string;quantity:number}>={};
  mappings.forEach((m,i)=>{if(quantities[i]>0)materials[m.key]={product_id:m.product_id,quantity:quantities[i]};});
  rows.push({source_row_number:rowNo,source_date:date,material_supplier:clean(row.getCell(cSupplier).value),vehicle_number:clean(row.getCell(cVehicle).value),unit_code:clean(row.getCell(cUnit||1).value)||"TON",materials,validation_status:"eligible",validation_message:"Ready to generate one draft invoice for this row."});eligible++;
 }
 if(!rows.length)redirect("/imports?error=No%20data%20rows%20found");
 const {data:batch,error:batchError}=await supabase.from("bulk_import_batches").insert({business_id:businessId,customer_id:parsed.data.customer_id,file_name:file.name.slice(0,250),status:"validated",total_rows:rows.length,eligible_rows:eligible,skipped_rows:skipped,error_rows:errors,created_by:userId}).select("id").single();
 if(batchError||!batch)redirect("/imports?error=Unable%20to%20save%20import%20preview");
 const payload=rows.map(r=>({batch_id:batch.id,source_row_number:r.source_row_number,source_date:r.source_date,material_supplier:r.material_supplier,vehicle_number:r.vehicle_number,unit_code:r.unit_code,materials:r.materials,validation_status:r.validation_status,validation_message:r.validation_message}));
 const {error:rowError}=await supabase.from("bulk_import_rows").insert(payload);
 if(rowError){await supabase.from("bulk_import_batches").delete().eq("id",batch.id);redirect("/imports?error=Unable%20to%20save%20import%20rows");}
 revalidatePath("/imports");redirect("/imports/"+batch.id);
}
export async function generateBatchInvoices(formData:FormData){
 const batchId=String(formData.get("batch_id")||"");if(!z.string().uuid().safeParse(batchId).success)redirect("/imports");
 const {supabase,businessId}=await context();
 const {data:batch}=await supabase.from("bulk_import_batches").select("*").eq("id",batchId).eq("business_id",businessId).maybeSingle();
 if(!batch||!["validated","failed"].includes(batch.status))redirect("/imports/"+batchId+"?error=This%20batch%20is%20already%20being%20processed%20or%20completed");
 const {data:claimed,error:claimError}=await supabase.from("bulk_import_batches").update({status:"generating"}).eq("id",batchId).eq("business_id",businessId).in("status",["validated","failed"]).select("id").maybeSingle();
 if(claimError||!claimed)redirect("/imports/"+batchId+"?error=This%20batch%20is%20already%20being%20processed");
 const {data:customer}=await supabase.from("customers").select("gstin,state_code").eq("id",batch.customer_id).eq("business_id",businessId).maybeSingle();
 if(!customer){await supabase.from("bulk_import_batches").update({status:"failed"}).eq("id",batchId);redirect("/imports/"+batchId+"?error=Selected%20customer%20could%20not%20be%20loaded");}
 const supplyType=customer.gstin?"B2B":"B2C";
 const {data:rows,error}=await supabase.from("bulk_import_rows").select("*").eq("batch_id",batchId).eq("validation_status","eligible").order("source_row_number");
 if(error||!rows?.length){await supabase.from("bulk_import_batches").update({status:"failed"}).eq("id",batchId);redirect("/imports/"+batchId+"?error=No%20eligible%20rows%20to%20generate");}

 let generated=0;let failed=0;
 for(const row of rows){
  const mats=row.materials as Record<string,{product_id:string;quantity:number}>;
  const items=Object.values(mats).filter(m=>m.quantity>0).map(m=>({product_id:m.product_id,quantity:m.quantity,unit_rate:null,discount_amount:0}));
  if(!items.length){failed++;continue;}
  const {data:invoiceId,error:invoiceError}=await supabase.rpc("create_goods_invoice_draft",{p_business_id:businessId,p_customer_id:batch.customer_id,p_invoice_date:row.source_date,p_supply_type:supplyType,p_items:items,p_delivery_details:{material_supplier:row.material_supplier,source_excel_row:row.source_row_number},p_transport_details:{vehicle_number:row.vehicle_number,unit_code:row.unit_code}});
  if(invoiceError||!invoiceId){failed++;await supabase.from("bulk_import_rows").update({validation_status:"error",validation_message:"Invoice generation failed. Check customer GST details and product setup."}).eq("id",row.id);continue;}
  const {error:updateError}=await supabase.from("bulk_import_rows").update({validation_status:"generated",invoice_id:invoiceId,validation_message:"Draft invoice generated."}).eq("id",row.id);
  if(updateError)failed++;else generated++;
 }
 await supabase.from("bulk_import_batches").update({status:failed?"failed":"completed"}).eq("id",batchId);
 revalidatePath("/invoices");revalidatePath("/imports");redirect("/imports/"+batchId+"?generated="+generated+"&failed="+failed);
}

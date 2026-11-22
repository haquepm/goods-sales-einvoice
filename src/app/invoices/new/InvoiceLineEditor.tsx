"use client";

import { useMemo, useState } from "react";

type Product={id:string;description:string;hsn_code:string;unit_code:string;gst_rate:number;default_rate:number};
type Line={product_id:string;quantity:string;unit_rate:string;discount_amount:string};
export default function InvoiceLineEditor({products}:{products:Product[]}){
 const [lines,setLines]=useState<Line[]>([{product_id:"",quantity:"1",unit_rate:"0",discount_amount:"0"}]);
 const payload=useMemo(()=>JSON.stringify(lines.filter(x=>x.product_id&&Number(x.quantity)>0).map(x=>({...x,quantity:Number(x.quantity),unit_rate:Number(x.unit_rate),discount_amount:Number(x.discount_amount)}))),[lines]);
 function update(i:number,key:keyof Line,value:string){setLines(old=>old.map((x,n)=>n===i?{...x,[key]:value}:x));}
 function choose(i:number,id:string){const p=products.find(x=>x.id===id);setLines(old=>old.map((x,n)=>n===i?{...x,product_id:id,unit_rate:p?String(p.default_rate):"0"}:x));}
 return <div className="line-editor">
  <input type="hidden" name="items_json" value={payload}/>
  {lines.map((line,i)=>{const p=products.find(x=>x.id===line.product_id);return <div className="line-editor-row" key={i}>
   <div className="line-editor-heading"><strong>Line {i+1}</strong>{lines.length>1&&<button type="button" className="text-action" onClick={()=>setLines(old=>old.filter((_,n)=>n!==i))}>Remove</button>}</div>
   <div className="field"><label>Product / material *</label><select value={line.product_id} required onChange={e=>choose(i,e.target.value)}><option value="">Select product</option>{products.map(x=><option key={x.id} value={x.id}>{x.description} · HSN {x.hsn_code} · {x.gst_rate}%</option>)}</select></div>
   <div className="form-grid"><div className="field"><label>Quantity *</label><input type="number" min="0.001" step="0.001" value={line.quantity} required onChange={e=>update(i,"quantity",e.target.value)}/></div><div className="field"><label>Unit rate (₹) *</label><input type="number" min="0" step="0.01" value={line.unit_rate} required onChange={e=>update(i,"unit_rate",e.target.value)}/></div><div className="field"><label>Discount (₹)</label><input type="number" min="0" step="0.01" value={line.discount_amount} onChange={e=>update(i,"discount_amount",e.target.value)}/></div></div>
   {p&&<div className="line-meta">HSN {p.hsn_code} · {p.unit_code} · GST {p.gst_rate}%</div>}
  </div>})}
  <button type="button" className="secondary-btn add-line-btn" onClick={()=>setLines(old=>[...old,{product_id:"",quantity:"1",unit_rate:"0",discount_amount:"0"}])}>+ Add another item</button>
 </div>;
}

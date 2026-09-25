"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getCatalogueStudio } from "@/lib/studio-api";

export default function CatalogueStudioRedirect() {
  const params=useParams<{id:string}>(),router=useRouter();
  useEffect(()=>{
    let active=true;
    void getCatalogueStudio(params.id).then(design=>{if(active)router.replace(`/catalogue-studio/${design.id}/editor`);}).catch(caught=>{
      if(!active)return;
      if(caught instanceof ApiError&&caught.status===404)router.replace(`/catalogue-studio/new?catalogueId=${encodeURIComponent(params.id)}`);
      else router.replace("/catalogue-studio");
    });
    return()=>{active=false;};
  },[params.id,router]);
  return <main style={{padding:"3rem",fontFamily:"sans-serif"}}>Opening Catalogue Studio…</main>;
}

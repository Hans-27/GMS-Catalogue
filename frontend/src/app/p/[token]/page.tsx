import { PublicPromotionViewer } from "./public-promotion";
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicPromotionViewer token={token}/>;}

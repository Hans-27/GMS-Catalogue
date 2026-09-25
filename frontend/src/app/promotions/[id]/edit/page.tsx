import { PromotionWorkspace } from "../../promotion-workspace";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PromotionWorkspace mode="builder" id={id}/>;}

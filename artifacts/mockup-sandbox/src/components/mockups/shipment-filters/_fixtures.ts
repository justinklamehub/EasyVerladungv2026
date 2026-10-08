import { EMPTY_SHIPMENT_WORK_VIEWS, type ShipmentWorkViews } from "./_model";
export const useAuth=()=>({user:{id:0}});
export const useQuery=(_options:{queryFn:(context:{signal:AbortSignal})=>Promise<ShipmentWorkViews>;[key:string]:unknown})=>({data:EMPTY_SHIPMENT_WORK_VIEWS,error:null as Error|null,isError:false,isLoading:false,isFetching:false,refetch:async()=>undefined});
export const useQueryClient=()=>({setQueryData:(_key:unknown,_data:unknown)=>undefined,cancelQueries:async(_options:unknown)=>undefined,invalidateQueries:async(_options:unknown)=>undefined,removeQueries:(_options:unknown)=>undefined});
export const getShipmentWorkViews=async(_options?:RequestInit)=>({value:EMPTY_SHIPMENT_WORK_VIEWS});
export const putShipmentWorkViews=async(input:{value:ShipmentWorkViews},_options?:RequestInit)=>({ok:true,value:input.value});
export class ApiError extends Error {status=409;}

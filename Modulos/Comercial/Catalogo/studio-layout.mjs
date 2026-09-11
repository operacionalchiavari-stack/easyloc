export function fitsPlacement(box, occupied, walls, room, rules){
  if(box.minX < -room.width/2+rules.wallGap || box.maxX > room.width/2-rules.wallGap || box.minZ < -room.depth/2+rules.wallGap || box.maxZ > room.depth/2-rules.wallGap) return false;
  if(rules.aisle>0 && box.minX<rules.aisle/2 && box.maxX>-rules.aisle/2) return false;
  for(const other of occupied){
    const gap=box.table&&other.table ? Math.max(rules.tableGap,rules.furnitureGap) : rules.furnitureGap;
    if(box.minX<other.maxX+gap && box.maxX>other.minX-gap && box.minZ<other.maxZ+gap && box.maxZ>other.minZ-gap)return false;
  }
  // Segment versus expanded rectangle (slab intersection), including diagonal walls.
  for(const wall of walls){
    let lo=0,hi=1;
    for(const [a,b,min,max] of [[wall.start.x,wall.end.x,box.minX-rules.wallGap,box.maxX+rules.wallGap],[wall.start.z,wall.end.z,box.minZ-rules.wallGap,box.maxZ+rules.wallGap]]){
      const d=b-a;
      if(Math.abs(d)<1e-9){if(a<min||a>max){hi=-1;break;}}
      else{const t1=(min-a)/d,t2=(max-a)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
    }
    if(lo<=hi)return false;
  }
  return true;
}

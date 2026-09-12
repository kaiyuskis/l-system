import * as THREE from "three";

/** Folded botanical surfaces, anchored at the petiole base (local origin).
 * Shared by instanced previews and GLB export; no camera-facing billboards. */
class OrganMesh {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  vertex(x: number,y: number,z: number,r=1,g=1,b=1): number {
    const i=this.positions.length/3;
    this.positions.push(x,y,z);this.colors.push(r,g,b);return i;
  }
  triangle(a:number,b:number,c:number) {this.indices.push(a,b,c);}
  tube(points: THREE.Vector3[],radius:number,color:THREE.Color,sides=4) {
    const offset=this.positions.length/3;
    let frame=new THREE.Vector3(1,0,0);
    for(let i=0;i<points.length;i++) {
      const tangent=points[Math.min(points.length-1,i+1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      if(Math.abs(frame.dot(tangent))>.95)frame.set(0,0,1);
      frame.addScaledVector(tangent,-frame.dot(tangent)).normalize();
      const second=new THREE.Vector3().crossVectors(tangent,frame).normalize();
      for(let side=0;side<sides;side++) {
        const angle=side*Math.PI*2/sides;
        const p=points[i].clone().addScaledVector(frame,Math.cos(angle)*radius).addScaledVector(second,Math.sin(angle)*radius);
        this.vertex(p.x,p.y,p.z,color.r,color.g,color.b);
      }
      if(i)for(let side=0;side<sides;side++) {
        const a=offset+(i-1)*sides+side,b=offset+(i-1)*sides+(side+1)%sides;
        this.triangle(a,b,a+sides);this.triangle(b,b+sides,a+sides);
      }
    }
  }
  finish(): THREE.BufferGeometry {
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(this.positions,3));
    g.setAttribute("color",new THREE.Float32BufferAttribute(this.colors,3));
    g.setIndex(this.indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
  }
}
export function broadleaf(kind:"birch"|"maple"|"cherry"|"fern"|"oak"|"willow"|"ginkgo"):THREE.BufferGeometry {
  if (kind === "oak" || kind === "willow") return elongatedLeaf(kind);
  if (kind === "ginkgo") return ginkgoLeaf();
  const m=new OrganMesh();
  const fern=kind==="fern",maple=kind==="maple";
  const stem=fern?.002:maple?.033:.021;
  const height=fern?.065:maple?.19:kind==="birch"?.145:.19;
  const halfWidth=fern?.014:kind==="birch"?.048:.047;
  const curve=(x:number,y:number)=>Math.abs(x)*.13+(y-stem)*(y-stem)*.42;
  const veinColor=new THREE.Color(.80,.88,.56);
  m.tube([new THREE.Vector3(),new THREE.Vector3(0,stem,curve(0,stem))],fern?.00035:.00065,new THREE.Color(.58,.68,.40));
  if(maple) {
    const centerY=.096;
    const center=m.vertex(0,centerY,.008,.78,.84,.65);
    const points:number[]=[];
    // Seven narrow lobes, with deep sinuses and toothed edges.
    const lobes=[[-2.57,.058],[-1.9,.082],[-1.05,.105],[0,.128],[1.05,.105],[1.9,.082],[2.57,.058]];
    const outline:THREE.Vector3[]=[];
    for(let i=0;i<lobes.length;i++) {
      const [angle,radius]=lobes[i];
      for(let j=0;j<9;j++) {
        const t=j/8;
        const a=angle+(t-.5)*.72;
        const r=radius*(.34+.66*Math.pow(Math.sin(Math.PI*t),1.3))*(j%2?.91:1);
        outline.push(new THREE.Vector3(Math.sin(a)*r,centerY+Math.cos(a)*r,0));
      }
    }
    for(const p of outline)points.push(m.vertex(p.x,p.y,curve(p.x,p.y),.81,.86,.76));
    for(let i=0;i<points.length;i++)m.triangle(center,points[(i+1)%points.length],points[i]);
    for(const [angle,radius] of lobes) {
      const x=Math.sin(angle)*radius*.93,y=centerY+Math.cos(angle)*radius*.93;
      m.tube([new THREE.Vector3(0,stem,.002),new THREE.Vector3(0,centerY,.009),new THREE.Vector3(x,y,curve(x,y)+.0004)],.00035,veinColor,3);
    }
  } else {
    const rows=24,columns=5;
    const offset=m.positions.length/3;
    const width=(t:number)=>halfWidth*Math.pow(Math.sin(Math.PI*t),fern?.5:.75)*(kind==="birch"?1.15-t*.58:1-t*.18)*(fern?1-.16*Math.cos(t*Math.PI*16):1-.08*Math.cos(t*Math.PI*24));
    for(let row=0;row<=rows;row++) {
      const t=row/rows,y=stem+height*t;
      for(let column=0;column<columns;column++) {
        const u=column/(columns-1)*2-1;
        const x=u*Math.max(.0001,width(t));
        const shade=.74+.2*(1-Math.abs(u))+.07*Math.sin(t*Math.PI);
        m.vertex(x,y,curve(x,y),shade,shade,shade*.88);
      }
    }
    for(let row=0;row<rows;row++)for(let column=0;column<columns-1;column++) {
      const a=offset+row*columns+column,b=a+columns;
      m.triangle(a,a+1,b);m.triangle(a+1,b+1,b);
    }
    m.tube([0,.25,.5,.75,1].map(t=>new THREE.Vector3(0,stem+height*t,curve(0,stem+height*t)+.00045)),fern?.00018:.00035,veinColor,3);
    if(!fern)for(let i=1;i<8;i++)for(const side of [-1,1]) {
      const t=i/9,end=Math.min(.95,t+.10),y=stem+height*t,ey=stem+height*end,x=width(end)*.92*side;
      m.tube([new THREE.Vector3(0,y,curve(0,y)+.0004),new THREE.Vector3(x,ey,curve(x,ey)+.0004)],.00018,veinColor,3);
    }
  }
  return m.finish();
}

export function cherryBlossom():THREE.BufferGeometry {
  const m=new OrganMesh();
  const stalk=new THREE.Color(.53,.61,.33);
  const centerY=.058;
  m.tube([new THREE.Vector3(),new THREE.Vector3(.004,.030,0),new THREE.Vector3(0,centerY,0)],.00065,stalk);
  // Five gently cupped petals with notched outer tips. Local +Y is flower normal.
  for(let petal=0;petal<5;petal++) {
    const angle=petal*Math.PI*2/5,rows=7,columns=5;
    const offset=m.positions.length/3;
    for(let i=0;i<=rows;i++) {
      const t=i/rows;
      for(let j=0;j<columns;j++) {
        const u=j/(columns-1)*2-1;
        const notch=t>.8?(1-Math.abs(u))*.002*(t-.8)/.2:0;
        const radial=.002+t*.024-notch;
        const across=u*(.001+.013*Math.sin(t*Math.PI*.83));
        const x=Math.cos(angle)*radial-Math.sin(angle)*across;
        const z=Math.sin(angle)*radial+Math.cos(angle)*across;
        const y=centerY+.007*t*t+.002*u*u;
        const shade=.88+.12*t;
        m.vertex(x,y,z,shade,shade*(.69+.31*t),shade*(.77+.23*t));
      }
    }
    for(let i=0;i<rows;i++)for(let j=0;j<columns-1;j++) {
      const a=offset+i*columns+j,b=a+columns;
      m.triangle(a,b,a+1);m.triangle(a+1,b,b+1);
    }
  }
  for(let i=0;i<14;i++) {
    const a=i*Math.PI*2/14,r=.0045+(i%3)*.0007;
    const end=new THREE.Vector3(Math.cos(a)*r,centerY+.010+(i%3)*.001,Math.sin(a)*r);
    m.tube([new THREE.Vector3(0,centerY,0),end],.00024,new THREE.Color(.98,.91,.68),3);
    m.tube([end,end.clone().add(new THREE.Vector3(0,.0012,0))],.00068,new THREE.Color(.95,.66,.23),4);
  }
  return m.finish();
}

/** Oak has rounded lobes; willow a narrow, finely serrated lanceolate blade. */
function elongatedLeaf(kind: "oak" | "willow"): THREE.BufferGeometry {
  const m = new OrganMesh();
  const oak = kind === "oak";
  const stem = oak ? .022 : .016, length = oak ? .18 : .24;
  const halfWidth = oak ? .059 : .014;
  const rows = oak ? 40 : 28, columns = 5;
  const width = (t: number) => halfWidth * Math.pow(Math.sin(Math.PI * t), oak ? .52 : .85)
    * (oak ? .72 + .28 * Math.cos(t * Math.PI * 10 + .5) : 1 - .045 * Math.cos(t * Math.PI * 28));
  const z = (x: number, t: number) => Math.abs(x) * .16 + .016 * t * t;
  m.tube([new THREE.Vector3(), new THREE.Vector3(0,stem,0)], .0006, new THREE.Color(.65,.72,.47));
  const offset = m.positions.length / 3;
  for (let row=0; row<=rows; row++) {
    const t=row/rows;
    for (let column=0; column<columns; column++) {
      const u=2*column/(columns-1)-1, x=u*Math.max(.00003,width(t));
      const shade=.80+.16*(1-Math.abs(u));
      m.vertex(x,stem+length*t,z(x,t),shade,shade,shade*.89);
    }
  }
  for(let row=0;row<rows;row++)for(let c=0;c<columns-1;c++) {
    const a=offset+row*columns+c,b=a+columns;
    m.triangle(a,a+1,b);m.triangle(a+1,b+1,b);
  }
  const vein=new THREE.Color(.79,.88,.57);
  m.tube([0,.25,.5,.75,1].map(t=>new THREE.Vector3(0,stem+length*t,z(0,t)+.0003)),.0003,vein,3);
  for(let i=1;i<=8;i++)for(const side of [-1,1]) {
    const t=i/10,end=Math.min(.98,t+.07),x=width(end)*side*.94;
    m.tube([new THREE.Vector3(0,stem+length*t,z(0,t)+.0003),new THREE.Vector3(x,stem+length*end,z(x,end)+.0003)],.00014,vein,3);
  }
  return m.finish();
}

/** A petiole and fan-shaped blade with a central cleft and radiating veins. */
function ginkgoLeaf(): THREE.BufferGeometry {
  const m=new OrganMesh(), stem=.042, rows=7, columns=33;
  const point=(t:number,a:number) => {
    const edge=.10*(.97+.025*Math.cos(a*18))-.015*Math.exp(-a*a/.025);
    const r=t*edge;
    return new THREE.Vector3(Math.sin(a)*r,stem+Math.cos(a)*r,.006*t*t*Math.cos(a*4)+.003*Math.abs(a)*t);
  };
  m.tube([new THREE.Vector3(),new THREE.Vector3(0,stem,0)],.0007,new THREE.Color(.71,.79,.42));
  const offset=m.positions.length/3;
  for(let row=0;row<=rows;row++)for(let col=0;col<columns;col++) {
    const t=Math.max(.001,row/rows),a=(col/(columns-1)*2-1)*1.12,p=point(t,a);
    const shade=.80+.13*t+.03*Math.cos(a*20);
    m.vertex(p.x,p.y,p.z,shade,shade,shade*.88);
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns-1;col++) {
    const a=offset+row*columns+col,b=a+columns;
    m.triangle(a,a+1,b);m.triangle(a+1,b+1,b);
  }
  for(let i=0;i<17;i++) {
    const a=(i/16*2-1)*1.1;
    m.tube([.03,.35,.65,.94].map(t=>point(t,a).add(new THREE.Vector3(0,0,.00024))),.00016,new THREE.Color(.87,.92,.62),3);
  }
  return m.finish();
}

export const SPRUCE_NEEDLES_PER_SHOOT = 40;
/** Short, single needles radiate around a woody spruce twig, unlike pine pairs. */
export function spruceNeedles(length=1): THREE.BufferGeometry {
  const m=new OrganMesh(), stem=.12;
  m.tube([new THREE.Vector3(),new THREE.Vector3(0,stem,0)],.0015,new THREE.Color(.57,.45,.27),5);
  for(let i=0;i<SPRUCE_NEEDLES_PER_SHOOT;i++) {
    const t=(i+.5)/SPRUCE_NEEDLES_PER_SHOOT,a=i*2.3999632297;
    const base=new THREE.Vector3(0,stem*t,0);
    const direction=new THREE.Vector3(Math.cos(a),.25+.45*t,Math.sin(a)).normalize();
    const side=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
    const across=new THREE.Vector3().crossVectors(direction,side).normalize();
    const needleLength=(.030+.016*((i*17)%13)/13)*length;
    const start=m.positions.length/3;
    for(let ring=0;ring<2;ring++)for(let j=0;j<4;j++) {
      const theta=j*Math.PI/2,r=.0011*(ring===0?1:.68);
      const p=base.clone().addScaledVector(direction,needleLength*ring*.78).addScaledVector(side,Math.cos(theta)*r).addScaledVector(across,Math.sin(theta)*r);
      m.vertex(p.x,p.y,p.z,.78+ring*.12,.88+ring*.08,.73+ring*.10);
    }
    const tip=base.clone().addScaledVector(direction,needleLength);
    const tipIndex=m.vertex(tip.x,tip.y,tip.z,.93,.98,.81);
    for(let j=0;j<4;j++) {
      const a=start+j,b=start+(j+1)%4;
      m.triangle(a,b,a+4);m.triangle(b,b+4,a+4);m.triangle(a+4,b+4,tipIndex);
    }
  }
  return m.finish();
}

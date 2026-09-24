import { Quadscan } from 'quadscan';
import * as THREE from 'three';
import './style.css';

type Point = { x: number; y: number };
type Corners = { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point };
const keys: (keyof Corners)[] = ['topLeft','topRight','bottomRight','bottomLeft'];
const $ = <T extends Element>(id: string) => document.getElementById(id) as unknown as T;
const video = $<HTMLVideoElement>('camera');
const stage = $('stage');
const toggle = $<HTMLButtonElement>('toggle');
const status = $('status');
const detail = $('detail');
const hint = $('hint');
const badge = $('badge');
const fps = $('fps');
const polygon = $<SVGPolygonElement>('paper-outline');
const outline = $<SVGSVGElement>('outline');
const canvas = $<HTMLCanvasElement>('scene');
const sample = document.createElement('canvas');
sample.width = 640; sample.height = 480;
const ctx = sample.getContext('2d', { willReadFrequently: true })!;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0, 0);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 3000);
camera.position.z = 1000;
const cube = new THREE.Group();
const geometry = new THREE.BoxGeometry(1, 1, 1);
const faces = [0xc8ff61,0x8ed943,0xe8ffae,0x6cae34,0xb0e657,0x4a802c].map(c => new THREE.MeshStandardMaterial({ color:c, roughness:.45, metalness:.1 }));
cube.add(new THREE.Mesh(geometry, faces));
const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({color:0xffffff, transparent:true,opacity:.64}));
cube.add(edges); cube.visible = false; scene.add(cube);
scene.add(new THREE.AmbientLight(0xffffff, 2));
const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-2,3,5); scene.add(light);
let stream: MediaStream | null = null;
let scanner: Quadscan | null = null;
let target: Corners | null = null;
let smoothed: Corners | null = null;
let lastSeen = 0;
let running = false;
let generation = 0;
let raf = 0;
let resizeObserver: ResizeObserver;
const dist = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
function resize() {
  const w=stage.clientWidth,h=stage.clientHeight;
  renderer.setSize(w,h,false); camera.right=w; camera.top=h;camera.updateProjectionMatrix();
  outline.setAttribute('viewBox',`0 0 ${w} ${h}`);
}
function toView(p:Point): Point {
  const w=stage.clientWidth,h=stage.clientHeight;
  return {x:p.x*w/sample.width,y:p.y*h/sample.height};
}
function frame() {
  if(!running)return;
  raf=requestAnimationFrame(frame);
  const now=performance.now();
  if(target && now-lastSeen<550){
    if(!smoothed)smoothed=structuredClone(target);
    for(const k of keys){smoothed[k].x += (target[k].x-smoothed[k].x)*.42;smoothed[k].y += (target[k].y-smoothed[k].y)*.42;}
    const pts=keys.map(k=>toView(smoothed![k]));
    const [tl,tr,br,bl]=pts;
    polygon.setAttribute('points',pts.map(p=>`${p.x},${p.y}`).join(' '));
    const x=(tl.x+tr.x+br.x+bl.x)/4,y=(tl.y+tr.y+br.y+bl.y)/4;
    const width=(dist(tl,tr)+dist(bl,br))/2;
    const side=(dist(tl,bl)+dist(tr,br))/2;
    const size=Math.max(18,Math.min(width*.28,side*.32,stage.clientWidth*.36));
    cube.position.set(x,stage.clientHeight-y,0);
    cube.scale.setScalar(size);
    cube.rotation.z=-Math.atan2(tr.y-tl.y,tr.x-tl.x);
    cube.rotation.x=-.28+THREE.MathUtils.clamp((dist(tl,tr)-dist(bl,br))/Math.max(width,1),-.4,.4);
    cube.rotation.y=.38+THREE.MathUtils.clamp((dist(tl,bl)-dist(tr,br))/Math.max(side,1),-.4,.4);
    cube.visible=true;outline.classList.add('visible');
  }else{
    cube.visible=false;outline.classList.remove('visible');smoothed=null;
    if(target){target=null;status.textContent='正在寻找纸张';detail.textContent='将整张纸放回画面';badge.textContent='● SCANNING';hint.textContent='让整张纸进入画面，保持背景与纸张有对比';stage.classList.remove('locked');}
  }
  renderer.render(scene,camera);
}
async function detect(currentGeneration: number){
  let errors = 0;
  while(running && generation===currentGeneration){
    const started=performance.now();
    try{
      if(video.readyState>=2 && scanner){
        const vw=video.videoWidth,vh=video.videoHeight;
        const aspect=stage.clientWidth/stage.clientHeight;
        let sw=vw,sh=vh;
        if(vw/vh>aspect)sw=vh*aspect;else sh=vw/aspect;
        ctx.drawImage(video,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,sample.width,sample.height);
        const result=await scanner.scan(sample,{mode:'detect'});
        if(!running || generation!==currentGeneration)break;
        errors=0;
        if(result.success && result.corners && keys.every(k=>Number.isFinite(result.corners![k].x)&&Number.isFinite(result.corners![k].y))){
          target=result.corners as Corners;lastSeen=performance.now();
          status.textContent='纸张已锁定';detail.textContent='移动纸张，观察方块的追踪效果';badge.textContent='● PAPER LOCKED';hint.textContent='3D 方块正在跟随纸张';stage.classList.add('locked');
        }else if(performance.now()-lastSeen>550){stage.classList.remove('locked');}
        fps.textContent=`${Math.round(1000/Math.max(performance.now()-started,1))} DET/S`;
      }
    }catch(e){
      if(!running || generation!==currentGeneration)break;
      console.warn('纸张检测失败，正在重试',e);
      errors++;
      if(errors>=3){
        status.textContent='正在恢复检测';detail.textContent='请稍等，保持纸张在画面内';
        try{
          scanner?.dispose();
          const replacement=new Quadscan();
          await replacement.initialize();
          if(!running || generation!==currentGeneration){replacement.dispose();break;}
          scanner=replacement;errors=0;
        }catch(recoveryError){console.warn('重新加载检测器失败',recoveryError);}
      }
    }
    await new Promise(r=>setTimeout(r,Math.max(0,(errors ? 300 : 65)-(performance.now()-started))));
  }
}
async function start(){
  toggle.disabled=true;status.textContent='正在启动摄像头';detail.textContent='首次加载纸张识别模型需要一点时间';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('需要 HTTPS 或 localhost 才能使用摄像头');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=stream;await video.play();
    scanner=new Quadscan();await scanner.initialize();
    running=true;const currentGeneration=++generation;resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
    frame();void detect(currentGeneration);
    stage.classList.add('active');status.textContent='正在寻找纸张';detail.textContent='请把整张纸放进画面';badge.textContent='● SCANNING';hint.textContent='让纸张四角清晰可见';
    toggle.innerHTML='关闭摄像头 <span>×</span>';
  }catch(e){
    stream?.getTracks().forEach(t=>t.stop());stream=null;scanner?.dispose();scanner=null;
    status.textContent='无法启动';detail.textContent=e instanceof Error?e.message:'请允许摄像头访问后重试';badge.textContent='● CAMERA OFF';
  }finally{toggle.disabled=false;}
}
function stop(){
  running=false;generation++;cancelAnimationFrame(raf);resizeObserver?.disconnect();stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
  scanner?.dispose();scanner=null;target=null;smoothed=null;cube.visible=false;polygon.setAttribute('points','');renderer.render(scene,camera);
  stage.classList.remove('active','locked');outline.classList.remove('visible');
  status.textContent='等待启动';detail.textContent='建议使用手机后置摄像头';badge.textContent='● CAMERA OFF';fps.textContent='—';hint.textContent='将摄像头对准桌上的作业或一张白纸';
  toggle.innerHTML='开启摄像头 <span>↗</span>';
}
toggle.addEventListener('click',()=>running?stop():void start());
window.addEventListener('pagehide',stop);
resize();renderer.render(scene,camera);

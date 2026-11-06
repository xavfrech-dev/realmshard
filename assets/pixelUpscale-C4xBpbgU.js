const h=`#version 300 es
in vec2 aPos;
uniform float uFlip;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, uFlip > 0.5 ? 0.5 - aPos.y * 0.5 : aPos.y * 0.5 + 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,E=`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize;
in vec2 vUv;
out vec4 o;
void main() {
  o = texelFetch(uSrc, clamp(ivec2(floor(vUv * uSize)), ivec2(0), ivec2(uSize) - 1), 0);
}`,b=`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize;
uniform float uDelta;
in vec2 vUv;
out vec4 o;

const vec4 Ao = vec4( 1.0, -1.0, -1.0,  1.0);
const vec4 Bo = vec4( 1.0,  1.0, -1.0, -1.0);
const vec4 Co = vec4( 1.5,  0.5, -0.5,  0.5);
const vec4 Ax = vec4( 1.0, -1.0, -1.0,  1.0);
const vec4 Bx = vec4( 0.5,  2.0, -0.5, -2.0);
const vec4 Cx = vec4( 1.0,  1.0, -0.5,  0.0);
const vec4 Ay = vec4( 1.0, -1.0, -1.0,  1.0);
const vec4 By = vec4( 2.0,  0.5, -2.0, -0.5);
const vec4 Cy = vec4( 2.0,  0.0, -1.0,  0.5);
const vec4 Ci = vec4(0.25);
const vec4 LW = vec4(14.352, 28.176, 5.472, 48.0);

vec4 T(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), ivec2(uSize) - 1), 0); }
float Y(vec4 c) { return dot(c, LW); }
vec4 df(vec4 a, vec4 b) { return abs(a - b); }
float cdf(vec4 a, vec4 b) { vec4 d = abs(a - b); return d.r + d.g + d.b + d.a; }
vec4 neq(vec4 a, vec4 b) { return vec4(greaterThan(df(a, b), vec4(0.6))); }
vec4 wd(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) {
  return df(a, b) + df(a, c) + df(d, e) + df(d, f) + 4.0 * df(g, h);
}

void main() {
  vec2 pos = vUv * uSize;
  ivec2 ip = ivec2(floor(pos));
  vec2 fp = fract(pos);

  vec4 A1 = T(ip + ivec2(-1, -2)), B1 = T(ip + ivec2(0, -2)), C1 = T(ip + ivec2(1, -2));
  vec4 A  = T(ip + ivec2(-1, -1)), B  = T(ip + ivec2(0, -1)), C  = T(ip + ivec2(1, -1));
  vec4 D  = T(ip + ivec2(-1,  0)), E  = T(ip),                F  = T(ip + ivec2(1,  0));
  vec4 G  = T(ip + ivec2(-1,  1)), H  = T(ip + ivec2(0,  1)), I  = T(ip + ivec2(1,  1));
  vec4 G5 = T(ip + ivec2(-1,  2)), H5 = T(ip + ivec2(0,  2)), I5 = T(ip + ivec2(1,  2));
  vec4 A0 = T(ip + ivec2(-2, -1)), D0 = T(ip + ivec2(-2, 0)), G0 = T(ip + ivec2(-2, 1));
  vec4 C4 = T(ip + ivec2( 2, -1)), F4 = T(ip + ivec2( 2, 0)), I4 = T(ip + ivec2( 2, 1));

  vec4 b = vec4(Y(B), Y(D), Y(H), Y(F));
  vec4 c = vec4(Y(C), Y(A), Y(G), Y(I));
  vec4 e = vec4(Y(E));
  vec4 d = b.yzwx, f = b.wxyz, g = c.zwxy, h = b.zwxy, i = c.wxyz;
  vec4 i4 = vec4(Y(I4), Y(C1), Y(A0), Y(G5));
  vec4 i5 = vec4(Y(I5), Y(C4), Y(A1), Y(G0));
  vec4 h5 = vec4(Y(H5), Y(F4), Y(B1), Y(D0));
  vec4 f4 = h5.yzwx;

  vec4 fx      = Ao * fp.y + Bo * fp.x;
  vec4 fx_left = Ax * fp.y + Bx * fp.x;
  vec4 fx_up   = Ay * fp.y + By * fp.x;

  vec4 lv0 = neq(e, f) * neq(e, h);
  vec4 lv2Left = neq(e, g) * neq(d, g);
  vec4 lv2Up = neq(e, c) * neq(b, c);

  vec4 delta = vec4(uDelta);
  vec4 fx45i = clamp((fx + delta - Co - Ci) / (2.0 * delta), 0.0, 1.0);
  vec4 fx45  = clamp((fx + delta - Co) / (2.0 * delta), 0.0, 1.0);
  vec4 fx30  = clamp((fx_left + delta - Cx) / (2.0 * delta), 0.0, 1.0);
  vec4 fx60  = clamp((fx_up + delta - Cy) / (2.0 * delta), 0.0, 1.0);

  vec4 wd1 = wd(e, c, g, i, h5, f4, h, f);
  vec4 wd2 = wd(h, d, i5, f, i4, b, e, i);

  vec4 edri = vec4(lessThanEqual(wd1, wd2)) * lv0;
  vec4 edr = vec4(lessThan(wd1, wd2)) * lv0;
  vec4 edrLeft = vec4(lessThanEqual(2.0 * df(f, g), df(h, c))) * lv2Left * edr;
  vec4 edrUp = vec4(greaterThanEqual(df(f, g), 2.0 * df(h, c))) * lv2Up * edr;

  fx45 *= edr;
  fx30 *= edrLeft;
  fx60 *= edrUp;
  fx45i *= edri;

  vec4 px = vec4(lessThanEqual(df(e, f), df(e, h)));
  vec4 m = max(max(fx30, fx60), max(fx45, fx45i));

  vec4 r1 = mix(E, mix(H, F, px.x), m.x);
  r1 = mix(r1, mix(B, D, px.z), m.z);
  vec4 r2 = mix(E, mix(F, B, px.y), m.y);
  r2 = mix(r2, mix(D, H, px.w), m.w);
  o = mix(r1, r2, step(cdf(E, r1), cdf(E, r2)));
}`,g=`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize;
uniform float uSharp;
in vec2 vUv;
out vec4 o;
vec4 T(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), ivec2(uSize) - 1), 0); }
void main() {
  ivec2 ip = ivec2(floor(vUv * uSize));
  vec4 E = T(ip);
  vec3 a = T(ip + ivec2(-1, -1)).rgb, b = T(ip + ivec2(0, -1)).rgb, c = T(ip + ivec2(1, -1)).rgb;
  vec3 d = T(ip + ivec2(-1, 0)).rgb, e = E.rgb, f = T(ip + ivec2(1, 0)).rgb;
  vec3 g = T(ip + ivec2(-1, 1)).rgb, h = T(ip + ivec2(0, 1)).rgb, i = T(ip + ivec2(1, 1)).rgb;
  vec3 mn = min(min(min(d, e), min(f, b)), h);
  mn += min(mn, min(min(a, c), min(g, i)));
  vec3 mx = max(max(max(d, e), max(f, b)), h);
  mx += max(mx, max(max(a, c), max(g, i)));
  vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, uSharp));
  vec3 col = ((b + d + f + h) * w + e) / (1.0 + 4.0 * w);
  o = vec4(clamp(col, vec3(0.0), vec3(E.a)), E.a);
}`;class A{canvas;gl;maxTex;nearest;xbr;cas;scratch;constructor(t,a){this.gl=t,this.canvas=a,this.maxTex=t.getParameter(t.MAX_TEXTURE_SIZE),this.scratch=document.createElement("canvas");const c=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,c),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),t.STATIC_DRAW),this.nearest=this.program(E,["uSrc","uSize","uFlip"]),this.xbr=this.program(b,["uSrc","uSize","uFlip","uDelta"]),this.cas=this.program(g,["uSrc","uSize","uFlip","uSharp"])}program(t,a){const c=this.gl,e=(r,f)=>{const o=c.createShader(r);if(c.shaderSource(o,f),c.compileShader(o),!c.getShaderParameter(o,c.COMPILE_STATUS))throw new Error(`pixelUpscale: ${c.getShaderInfoLog(o)??"shader error"}`);return o},v=c.createProgram();if(c.attachShader(v,e(c.VERTEX_SHADER,h)),c.attachShader(v,e(c.FRAGMENT_SHADER,t)),c.bindAttribLocation(v,0,"aPos"),c.linkProgram(v),!c.getProgramParameter(v,c.LINK_STATUS))throw new Error(`pixelUpscale: ${c.getProgramInfoLog(v)??"link error"}`);const i={};for(const r of a)i[r]=c.getUniformLocation(v,r);return{p:v,u:i}}texture(t,a,c){const e=this.gl,v=e.createTexture();return e.bindTexture(e.TEXTURE_2D,v),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),c?(e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,c)):e.texImage2D(e.TEXTURE_2D,0,e.RGBA,t,a,0,e.RGBA,e.UNSIGNED_BYTE,null),v}draw(t,a,c,e,v,i){const r=this.gl;r.useProgram(t.p),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,a),r.uniform1i(t.u.uSrc,0),r.uniform2f(t.u.uSize,c,e),r.uniform1f(t.u.uFlip,v?1:0),i(t),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.drawArrays(r.TRIANGLE_STRIP,0,4)}bake(t,a,c,e,v){const i=this.gl,r=this.scratch;r.width=a,r.height=c;const f=r.getContext("2d");f.clearRect(0,0,a,c),f.drawImage(t,0,0);const o=this.texture(a,c,r),s=a*e,l=c*e;this.canvas.width=s,this.canvas.height=l,i.disable(i.BLEND);let m=null,x=null;v==="ultra"?(m=this.texture(s,l,null),x=i.createFramebuffer(),i.bindFramebuffer(i.FRAMEBUFFER,x),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,m,0),i.viewport(0,0,s,l),this.draw(this.xbr,o,a,c,!1,d=>i.uniform1f(d.u.uDelta,Math.max(.12,.6/e))),i.bindFramebuffer(i.FRAMEBUFFER,null),i.viewport(0,0,s,l),this.draw(this.cas,m,s,l,!0,d=>i.uniform1f(d.u.uSharp,.35))):(i.bindFramebuffer(i.FRAMEBUFFER,null),i.viewport(0,0,s,l),this.draw(this.nearest,o,a,c,!0,()=>{}));const p=document.createElement("canvas");return p.width=s,p.height=l,p.getContext("2d").drawImage(this.canvas,0,0),i.deleteTexture(o),m&&i.deleteTexture(m),x&&i.deleteFramebuffer(x),r.width=1,r.height=1,p}}let u;function T(){if(u!==void 0)return u;u=null;try{const n=document.createElement("canvas"),t=n.getContext("webgl2",{premultipliedAlpha:!0,preserveDrawingBuffer:!0,antialias:!1,alpha:!0});t&&(u=new A(t,n))}catch(n){console.warn("pixelUpscale: WebGL2 baker unavailable, using canvas fallback",n),u=null}return u}function R(){const n=T();return Math.min(16384,n?n.maxTex:8192)}function S(n,t,a,c,e){const v=T();if(v)try{return v.bake(n,t,a,c,e)}catch(f){console.warn("pixelUpscale: bake failed, using canvas fallback",f)}const i=document.createElement("canvas");i.width=t*c,i.height=a*c;const r=i.getContext("2d");return r.imageSmoothingEnabled=!1,r.drawImage(n,0,0,t*c,a*c),i}export{S as bakeUpscaled,R as maxBakeSide};

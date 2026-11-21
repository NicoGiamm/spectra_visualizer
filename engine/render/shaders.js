// GLSL for the band "special effects". Band looks live here, not in JS.
// uBand index follows BANDS order: 0 radio, 1 micro, 2 ir, 3 vis, 4 uv, 5 xray, 6 gamma.

export const COMMON = `
#ifndef SPECTRA_COMMON
#define SPECTRA_COMMON
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0., w=.5; for(int i=0;i<6;i++){ a+=w*n2(p); p=p*2.03+vec2(1.7,9.2); w*=.5; } return a; }
vec3 hsv(float h){ return clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.); }
vec3 thermal(float x){
  vec3 c = mix(vec3(.12,0.,.3), vec3(.9,.08,.12), smoothstep(0.,.35,x));
  c = mix(c, vec3(1.,.62,0.), smoothstep(.35,.7,x));
  return mix(c, vec3(1.,1.,.85), smoothstep(.7,1.,x)); }
#endif
`;

// Point source: camera-facing quad
export const QUAD_VS = `uniform float uSize; varying vec2 vUv;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.,0.,0.,1.); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`;

export const QUAD_FS = COMMON + `
uniform int uBand; uniform float uI, uTime, uSeed, uReal; uniform vec3 uColor; varying vec2 vUv;
void main(){
  vec2 p = vUv*2.-1.; float r = length(p), a = atan(p.y,p.x), T = uTime + uSeed*10.; vec3 col = vec3(0.);
  if(uBand==0){            // RADIO: expanding concentric rings
    float ph = fract(r*2.5 - T*.8);
    float ring = smoothstep(0.,.06,ph)*smoothstep(.18,.06,ph)*smoothstep(1.,.35,r);
    col = hsv(.87+.03*sin(T*2.))*ring*1.3 + vec3(1.,.3,.85)*exp(-r*r*45.)*2.;
  } else if(uBand==1){     // MICROWAVE: crackling pixel noise
    vec2 g = floor(p*13.); float m = step(.8, h21(g + floor(T*12.))) * smoothstep(1.,.15,r);
    col = mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7))*m*1.6 + vec3(1.,.5,0.)*exp(-r*r*9.)*.5;
  } else if(uBand==2){     // INFRARED
    if(uReal > .5){        // moving warm bodies: tight, low-contrast heat that rises, no false-colour rings
      vec2 q = p*vec2(1.15,.95); float rr = length(q);
      float body = exp(-rr*rr*5.5);
      float rise = smoothstep(-.15,.8,p.y)*exp(-rr*rr*1.8)*.45;
      float pulse = .85 + .15*sin(T*2.4 + uSeed*4.);
      col = (mix(vec3(1.,.5,.14), vec3(.8,.84,.95), .35)*body + vec3(1.,.62,.24)*rise)*.85*pulse;
    } else {               // static / hot sources: thermal-camera palette
      float rr = r*(1.+.08*sin(a*5.+T*6.)+.05*sin(T*9.)); float x = clamp(1.-rr,0.,1.);
      col = thermal(x)*smoothstep(1.,.55,rr)*1.4;
    }
  } else if(uBand==3){     // VISIBLE: plain light
    col = uColor*(exp(-r*r*22.)*2.6 + exp(-r*5.)*.35)*smoothstep(1.,.6,r);
  } else if(uBand==4){     // ULTRAVIOLET: violet glow + rotating rays
    float rays = pow(abs(cos(a*3.+T*1.5)),30.)*smoothstep(1.,.1,r);
    col = vec3(.62,.3,1.)*(exp(-r*r*10.)*2. + rays*1.3);
  } else if(uBand==5){     // X-RAY: flickering cyan scanlines
    float rowi = floor(vUv.y*40.); float lines = step(.5, fract(vUv.y*40. + T*2.));
    float flick = .55+.45*h21(vec2(rowi, floor(T*20.)));
    col = vec3(.45,1.,1.)*lines*flick*smoothstep(.95,.45,r)*1.2 + vec3(.8,1.,1.)*exp(-r*r*30.)*2.;
  } else {                 // GAMMA: hue-cycling jagged starburst
    float s1 = pow(abs(sin(a*7.+floor(T*15.)*1.7)),40.), s2 = pow(abs(sin(a*11.-floor(T*15.)*2.3)),60.);
    col = hsv(fract(T*1.1))*(s1+s2)*smoothstep(1.,0.,r)*1.6 + hsv(fract(T*1.1+.33))*exp(-r*r*20.)*2.6;
  }
  gl_FragColor = vec4(col*uI, 1.);
}`;

// Path source: camera-facing ribbon. u runs 0..1 along the path, v is -1..1 across it.
// uLen = length / width, so dash patterns keep a constant aspect; a wide-tipped ribbon breaks
// the radio dashes into confetti — build cones from streamlines + a mouth ring instead.
export const RIB_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;

export const RIB_FS = COMMON + `
uniform int uBand; uniform float uI, uTime, uSeed, uLen, uFade, uReal; uniform vec3 uColor; varying vec2 vUv;
void main(){
  float u = vUv.x, v = vUv.y, d = abs(v), T = uTime + uSeed*7.; vec3 c = vec3(0.);
  if(uBand==0){ float dash = step(.45, fract(u*uLen*.12 - T*1.5)); c = vec3(1.,.31,.85)*dash*exp(-d*d*5.)*1.4; }
  else if(uBand==1){ vec2 g = floor(vec2(u*uLen*.5, v*2.5)); c = mix(vec3(1.,.45,0.),vec3(1.,.85,.2),h21(g*1.7))*step(.72,h21(g+floor(T*12.)))*1.5*(1.-d*.5); }
  else if(uBand==2){ if(uReal > .5){ float hh = 1.-clamp(abs(v)*1.4,0.,1.); c = mix(vec3(1.,.5,.14), vec3(.82,.86,.96), .4)*hh*hh*.42; }
    else { float x = 1.-d; c = thermal(x*(.9+.1*sin(T*7.+u*20.)))*smoothstep(0.,.3,x)*1.3; } }
  else if(uBand==3){ c = uColor*(exp(-d*d*6.)*1.4 + exp(-d*d*40.)*1.); }
  else if(uBand==4){ c = vec3(.62,.3,1.)*(exp(-d*d*4.)*1.2 + exp(-d*d*40.)*1.2); }
  else if(uBand==5){ float off = (h21(vec2(floor(u*uLen*.6), floor(T*20.)))-.5)*.9; c = vec3(.5,1.,1.)*exp(-pow((v-off)*5.,2.))*1.7; }
  else { float off = (h21(vec2(floor(u*uLen*.8), floor(T*15.)))-.5)*1.2; c = hsv(fract(T*1.1+u))*exp(-pow((v-off)*3.,2.))*1.7; }
  gl_FragColor = vec4(c*uI*mix(1., u, uFade), 1.);
}`;

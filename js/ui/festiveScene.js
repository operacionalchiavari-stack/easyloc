(function () {
  'use strict';
  // Ilustrações vetoriais locais: sem vídeos, downloads ou serviços externos.
  const svg = content => `<svg class="festive-art" viewBox="0 0 600 460" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${content}</svg>`;
  const star = (x, y, size = 8) => `<path class="festive-twinkle" style="--delay:-${x % 5}s" d="M${x} ${y-size}Q${x} ${y} ${x+size} ${y}Q${x} ${y} ${x} ${y+size}Q${x} ${y} ${x-size} ${y}Q${x} ${y} ${x} ${y-size}" fill="#f5d99b"/>`;
  const stars = [[100,90],[480,70],[535,180],[340,42],[72,235],[440,135]].map(([x,y])=>star(x,y)).join('');

  function christmas() {
    const lights = [[378,188],[420,214],[356,253],[412,282],[450,308],[338,325],[397,348]].map(([x,y],i)=>`<circle class="festive-light" style="--delay:-${i*.4}s" cx="${x}" cy="${y}" r="5" fill="${['#ffda88','#ff8991','#a8e4c7'][i%3]}"/>`).join('');
    return svg(`${stars}<ellipse cx="322" cy="408" rx="235" ry="23" fill="#d9eeea" opacity=".13"/>
      <g class="festive-tree"><rect x="384" y="321" width="26" height="69" rx="5" fill="#916347"/>
      <path d="M398 93L328 218H353L300 302H332L279 375Q398 414 516 375L463 302H493L441 218H467Z" fill="#285f4a"/>
      <path d="M398 93L328 218Q393 240 467 218M353 218L300 302Q397 331 493 302M332 302L279 375Q398 414 516 375" stroke="#7aa689" stroke-width="3"/>
      <path d="M350 209Q394 258 444 251M325 294Q402 349 475 339" stroke="#e3be73" stroke-width="4" stroke-linecap="round"/>
      ${lights}${star(398,99,23)}</g>
      <g class="festive-santa"><ellipse cx="203" cy="395" rx="65" ry="10" fill="#0b2724" opacity=".25"/>
      <rect x="160" y="365" width="34" height="32" rx="10" fill="#192d32"/><rect x="207" y="365" width="34" height="32" rx="10" fill="#192d32"/>
      <path d="M151 300Q147 250 194 245H210Q256 250 258 304L263 368Q202 393 143 368Z" fill="#b94450"/>
      <path d="M147 350Q205 367 261 350" stroke="#f8eee1" stroke-width="18"/>
      <path d="M145 325Q202 338 259 325" stroke="#253637" stroke-width="12"/><rect x="192" y="322" width="24" height="19" rx="3" stroke="#f0ce83" stroke-width="5"/>
      <path d="M153 265Q125 277 117 319" stroke="#b94450" stroke-width="29" stroke-linecap="round"/><circle cx="115" cy="323" r="14" fill="#faf0de"/>
      <g class="festive-wave"><path d="M249 272Q276 269 282 232" stroke="#b94450" stroke-width="27" stroke-linecap="round"/><circle cx="284" cy="220" r="16" fill="#faf0de"/></g>
      <ellipse cx="204" cy="218" rx="48" ry="46" fill="#edc0a0"/><path d="M158 216Q151 289 205 290Q257 289 251 216Q244 244 229 231Q205 248 179 231Z" fill="#fff5e8"/>
      <path d="M157 191Q162 123 218 135L257 165L225 162L239 189Z" fill="#be4652"/><path d="M158 190Q207 176 249 192" stroke="#fff5e8" stroke-width="17" stroke-linecap="round"/><circle cx="258" cy="164" r="12" fill="#fff5e8"/>
      <circle cx="188" cy="213" r="3" fill="#433433"/><circle cx="220" cy="213" r="3" fill="#433433"/><ellipse cx="204" cy="226" rx="10" ry="8" fill="#dd9688"/>
      </g><g class="festive-gifts"><rect x="308" y="366" width="60" height="44" rx="5" fill="#c85c61"/><path d="M338 366V410M308 380H368" stroke="#eacb8b" stroke-width="6"/>
      <path d="M338 366Q312 339 317 359Q325 369 338 366Q362 341 359 358Q353 368 338 366" stroke="#eacb8b" stroke-width="4"/>
      <rect x="445" y="372" width="51" height="38" rx="4" fill="#ead2a1"/><path d="M471 372V410M445 384H496" stroke="#ae4350" stroke-width="5"/></g>`);
  }

  function newYear() {
    const bursts = [[155,120,'#e8be72'],[425,95,'#b2c8ec'],[489,240,'#f5dfaa']].map(([x,y,color],index)=>`<g class="festive-firework" style="--delay:-${index*1.3}s;transform-origin:${x}px ${y}px">${Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return `<path d="M${x+Math.cos(a)*20} ${y+Math.sin(a)*20}L${x+Math.cos(a)*64} ${y+Math.sin(a)*64}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`}).join('')}</g>`).join('');
    return svg(`${stars}${bursts}<ellipse cx="306" cy="410" rx="196" ry="20" fill="#d5b677" opacity=".12"/>
      <g class="festive-bottle"><path d="M168 256L185 182H212L229 256Q254 274 251 304L244 393Q204 412 160 393L153 304Q151 275 168 256" fill="#335d50" stroke="#83a48b" stroke-width="2"/>
      <path d="M183 182H214L220 224Q201 233 177 224Z" fill="#dab979"/><rect x="178" y="174" width="39" height="12" rx="4" fill="#ecd7a5"/>
      <path d="M158 295Q203 314 249 295L246 364Q203 381 157 361Z" fill="#e9d9b6"/>
      <path d="M176 322H231M183 336H224" stroke="#8a652c" stroke-width="3" stroke-linecap="round"/>${star(204,353,7)}</g>
      <g class="festive-cork"><rect x="188" y="142" width="21" height="26" rx="6" fill="#b58b55"/><path d="M166 151L158 142M226 143L234 132M201 124V112" stroke="#e9c57e" stroke-width="3" stroke-linecap="round"/></g>
      <g class="festive-glass festive-glass-left"><path d="M292 221H349L343 288Q339 310 320 310Q300 310 297 288Z" fill="#b0c5de" fill-opacity=".1" stroke="#f4ead4" stroke-width="3"/>
      <path d="M298 258H343L339 289Q335 304 320 304Q305 304 302 289Z" fill="#dab573" fill-opacity=".8"/><path d="M320 310V388M296 390H344" stroke="#f4ead4" stroke-width="3" stroke-linecap="round"/>
      <circle class="festive-bubble" cx="318" cy="285" r="3" fill="#fff2c8"/><circle class="festive-bubble" style="--delay:-1s" cx="329" cy="278" r="2" fill="#fff2c8"/></g>
      <g class="festive-glass festive-glass-right"><path d="M371 221H428L422 288Q418 310 399 310Q379 310 376 288Z" fill="#b0c5de" fill-opacity=".1" stroke="#f4ead4" stroke-width="3"/>
      <path d="M377 258H422L418 289Q414 304 399 304Q384 304 381 289Z" fill="#dab573" fill-opacity=".8"/><path d="M399 310V388M375 390H423" stroke="#f4ead4" stroke-width="3" stroke-linecap="round"/>
      <circle class="festive-bubble" cx="396" cy="282" r="3" fill="#fff2c8"/></g>`);
  }

  function easter() {
    const egg = (x,y,color,rotate=0)=>`<g transform="translate(${x} ${y}) rotate(${rotate})"><path d="M0 -45C-40 -45 -49 30 -23 44Q0 58 23 44C49 30 40 -45 0 -45Z" fill="${color}"/><path d="M-28 -8Q0 8 28 -8M-32 16Q0 32 32 16" stroke="#fff2df" stroke-width="5"/><circle cx="0" cy="-23" r="4" fill="#fff2df"/></g>`;
    return svg(`${stars}<ellipse cx="307" cy="405" rx="207" ry="22" fill="#d2b6df" opacity=".18"/>
      <path d="M102 392Q92 350 111 350Q126 354 120 385Q139 356 148 369Q152 387 128 401M466 394Q459 356 477 360Q490 367 482 391Q504 367 510 380Q513 393 488 402" fill="#a9c7a9"/>
      ${egg(440,347,'#d7acd0',12)}${egg(177,361,'#a5c7b2',-17)}
      <g class="festive-rabbit"><ellipse cx="310" cy="329" rx="67" ry="74" fill="#f4eadd"/><ellipse cx="310" cy="336" rx="45" ry="54" fill="#fff8ee"/>
      <circle cx="369" cy="341" r="20" fill="#fff8ee"/>
      <g class="festive-ear festive-ear-left"><ellipse cx="279" cy="174" rx="20" ry="65" transform="rotate(-13 279 174)" fill="#f4eadd"/><ellipse cx="279" cy="169" rx="9" ry="43" transform="rotate(-13 279 169)" fill="#dfaeb8"/></g>
      <g class="festive-ear festive-ear-right"><ellipse cx="336" cy="172" rx="20" ry="67" transform="rotate(10 336 172)" fill="#f4eadd"/><ellipse cx="336" cy="168" rx="9" ry="45" transform="rotate(10 336 168)" fill="#dfaeb8"/></g>
      <ellipse cx="308" cy="248" rx="62" ry="54" fill="#fff8ee"/><g class="festive-blink"><ellipse cx="287" cy="242" rx="4" ry="6" fill="#58445c"/><ellipse cx="329" cy="242" rx="4" ry="6" fill="#58445c"/></g>
      <ellipse cx="270" cy="259" rx="12" ry="7" fill="#eec3c4"/><ellipse cx="346" cy="259" rx="12" ry="7" fill="#eec3c4"/>
      <path d="M301 255Q308 249 315 255L308 262Z" fill="#c78e9e"/><path d="M308 262V268M296 270Q308 279 320 270" stroke="#997581" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="270" cy="390" rx="29" ry="14" fill="#fff8ee"/><ellipse cx="342" cy="390" rx="29" ry="14" fill="#fff8ee"/>
      <path d="M292 298L310 311L328 298V322L310 311L292 322Z" fill="#ac87bf"/>
      <ellipse cx="267" cy="326" rx="17" ry="27" transform="rotate(-20 267 326)" fill="#fff8ee"/></g>
      <g class="festive-chocolate"><rect x="362" y="347" width="61" height="61" rx="6" transform="rotate(8 362 347)" fill="#694533"/>
      <path d="M381 351L375 408M400 354L394 411M360 370L418 378M358 389L415 397" stroke="#a37355" stroke-width="3"/>
      <path d="M355 382L414 390L411 416L352 408Z" fill="#e7c2a1"/><path d="M375 385L374 411" stroke="#bf91b8" stroke-width="7"/></g>${egg(216,381,'#ecc198',8)}`);
  }

  function carnival() {
    return svg(`${stars}<ellipse cx="305" cy="396" rx="199" ry="23" fill="#d7abed" opacity=".12"/>
      <g class="festive-ribbons" stroke-linecap="round" stroke-width="6"><path d="M101 157Q158 117 130 214T133 321" stroke="#ebbd68"/><path d="M494 120Q449 172 491 197T479 290" stroke="#76c9b5"/><path d="M190 88Q221 126 183 140" stroke="#d5a3e9"/></g>
      <g class="festive-mask"><path d="M256 202Q180 141 201 80Q264 87 279 182" fill="#b780ce"/>
      <path d="M286 186Q240 90 296 52Q341 110 310 185" fill="#e9b95f"/>
      <path d="M324 189Q339 92 400 88Q410 154 343 203" fill="#62b8a5"/>
      <path d="M256 186L215 101M294 171L296 76M335 181L386 109" stroke="#f6dca7" stroke-width="2" opacity=".6"/>
      <path d="M160 211Q218 176 301 218Q382 176 443 211L424 302Q363 357 303 292Q242 357 179 302Z" fill="#bd85d0" stroke="#ecd19a" stroke-width="5"/>
      <path d="M301 218Q314 250 303 292Q363 357 424 302L443 211Q382 176 301 218" fill="#8d57a9"/>
      <path d="M190 245Q229 215 271 251Q237 286 199 270ZM335 251Q377 215 415 245L407 270Q368 286 335 251Z" fill="#392252" stroke="#f3d49a" stroke-width="5"/>
      <path d="M184 292Q233 331 277 283M330 283Q377 329 417 291" stroke="#e7b85e" stroke-width="4" stroke-dasharray="1 10" stroke-linecap="round"/>
      <path d="M413 313L469 400" stroke="#e7c282" stroke-width="10" stroke-linecap="round"/>${star(303,231,12)}</g>
      <g class="festive-notes" fill="#e8c179"><path d="M107 290V326Q83 317 81 334Q91 352 118 334V300L144 292V315Q121 309 122 326Q134 341 155 324V273Z"/><path d="M459 323V345Q441 339 440 353Q451 366 468 351V330L483 326V318Z"/></g>`);
  }

  const drawings = { natal: christmas, ano_novo: newYear, pascoa: easter, carnaval: carnival };
  function sceneHtml(id) {
    const draw = drawings[id];
    if (!draw) return '';
    const count = id === 'natal' ? 36 : 20;
    const particles = Array.from({length:count},(_,i)=>`<i style="--x:${(i*37+11)%100}%;--delay:-${(i*.73)%8}s;--duration:${6+i%6}s;--size:${id==='natal' ? 3+i%4 : 4+i%5}px;--drift:${i%2 ? 50 : -45}px;--particle:${(window.EasyLocTheme.FESTIVE_THEMES[id].cores)[i%3]}"></i>`).join('');
    return `<div class="festive-scene festive-${id}" aria-hidden="true"><div class="festive-orbit"></div><div class="festive-particles">${particles}</div>${draw()}</div>`;
  }
  function welcomeHtml(id, hero = false) {
    const theme = window.EasyLocTheme.festiveTheme(id);
    if (!theme) return '';
    const heading = hero ? 'h1' : 'h4';
    return `<div class="festive-welcome festive-${id}${hero ? ' hero-conteudo hero-slide hero-festivo ativo' : ''}" ${hero ? 'role="group" aria-roledescription="slide" data-duracao="15000"' : ''} aria-label="Boas-vindas de ${theme.nome}">
      ${sceneHtml(id)}<div class="festive-copy"><span class="festive-eyebrow">${theme.nome} · Com carinho, para nossa equipe</span><${heading}>${theme.titulo}</${heading}><p>${theme.mensagem}</p><span class="festive-signature">${theme.assinatura}</span></div></div>`;
  }
  window.EasyLocFestive = { sceneHtml, welcomeHtml };
})();

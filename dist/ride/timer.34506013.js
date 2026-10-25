var e;self.addEventListener("message",function(s){switch(s.data){case"start":e=setInterval(function(){self.postMessage("tick")},1e3);break;case"stop":case"pause":clearInterval(e)}},!1);
//# sourceMappingURL=timer.34506013.js.map

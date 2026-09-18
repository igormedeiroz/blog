document.addEventListener(&quot;DOMContentLoaded&quot;, function () {
  document.querySelectorAll(&quot;.post-body img&quot;).forEach(function (img) {
    let src = img.getAttribute(&quot;src&quot;);

    if (!src) return;

    // Remove os tamanhos que o Blogger adiciona à URL
    src = src.replace(/\/s\d+(-[a-z]+)?\//i, &quot;/s0/&quot;);
    src = src.replace(/=s\d+(-[a-z]+)?/i, &quot;=s0&quot;);

    img.removeAttribute(&quot;width&quot;);
    img.removeAttribute(&quot;height&quot;);
    img.src = src;
  });
});
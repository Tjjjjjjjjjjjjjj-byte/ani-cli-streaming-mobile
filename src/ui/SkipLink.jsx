// First tab stop on every page: jump past the top bar straight to the content.
function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#content"
      onClick={(e) => {
        e.preventDefault();
        const main = document.querySelector("main");
        if (!main) return;
        main.setAttribute("tabindex", "-1");
        main.focus({ preventScroll: false });
      }}
    >
      Skip to content
    </a>
  );
}

export default SkipLink;

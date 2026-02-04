export const AboutApp = () => {
  return (
    <div className="about-container">
      <div className="about-logo">VPSos</div>
      <p className="about-tagline">A web-native workspace for your VPS</p>
      
      <div className="about-section">
        <h4>Created by</h4>
        <a 
          href="https://x.com/alexintosh" 
          target="_blank" 
          rel="noopener noreferrer"
          className="about-link"
        >
          @alexintosh
        </a>
      </div>

      <div className="about-section">
        <h4>Source Code</h4>
        <a 
          href="https://github.com/alexintosh/vpsos" 
          target="_blank" 
          rel="noopener noreferrer"
          className="about-link"
        >
          github.com/alexintosh/vpsos
        </a>
      </div>

      <div className="about-sponsor">
        <p>Enjoying VPSos?</p>
        <a 
          href="https://github.com/sponsors/alexintosh" 
          target="_blank" 
          rel="noopener noreferrer"
          className="sponsor-button"
        >
          ♥ Sponsor this project
        </a>
      </div>
    </div>
  );
};

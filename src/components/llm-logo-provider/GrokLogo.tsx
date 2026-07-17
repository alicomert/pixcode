type GrokLogoProps = {
  className?: string;
};

/**
 * Grok Build / xAI mark. Bundled under public/icons for offline workbench use
 * (source: media.x.ai spacexai-symbol-white-transparent).
 */
const GrokLogo = ({ className = 'w-5 h-5' }: GrokLogoProps) => {
  return (
    <img
      src="/icons/grok-build-icon.png"
      alt="Grok Build"
      className={className}
      draggable={false}
    />
  );
};

export default GrokLogo;

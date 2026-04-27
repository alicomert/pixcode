import { useTheme } from '../../contexts/ThemeContext';

const OpencodeLogo = ({ className = 'w-5 h-5' }) => {
  const { isDarkMode } = useTheme();
  const src = isDarkMode ? '/icons/opencode-logo-dark.svg' : '/icons/opencode-logo-light.svg';
  return <img src={src} alt="OpenCode" className={className} />;
};

export default OpencodeLogo;

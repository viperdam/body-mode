import React from 'react';
import { usePermissionContext } from '../contexts/PermissionContext';
import ForegroundLocationDisclosure from './ForegroundLocationDisclosure';
import BackgroundLocationDisclosure from './BackgroundLocationDisclosure';
import PermissionBlockedModal from './PermissionBlockedModal';

const DisclosureModalContainer: React.FC = () => {
  const {
    activeDisclosure,
    isLoading,
    error,
    requestForegroundLocation,
    requestBackgroundLocation,
    dismissDisclosure,
    blockedType,
    dismissBlocked,
    openSettings,
  } = usePermissionContext();

  const handleDeny = () => dismissDisclosure('deny');
  const handleDismiss = () => dismissDisclosure('dismiss');

  return (
    <>
      <ForegroundLocationDisclosure
        visible={activeDisclosure === 'foreground'}
        onAllow={requestForegroundLocation}
        onDeny={handleDeny}
        onDismiss={handleDismiss}
        isLoading={isLoading}
        error={activeDisclosure === 'foreground' ? error : null}
      />

      <BackgroundLocationDisclosure
        visible={activeDisclosure === 'background'}
        onAllow={requestBackgroundLocation}
        onDeny={handleDeny}
        onDismiss={handleDismiss}
        isLoading={isLoading}
        error={activeDisclosure === 'background' ? error : null}
      />

      {blockedType && (
        <PermissionBlockedModal
          visible
          type={blockedType}
          onOpenSettings={openSettings}
          onClose={dismissBlocked}
        />
      )}
    </>
  );
};

export default DisclosureModalContainer;


import { AbstractConnector } from '@web3-react/abstract-connector'
import { UnsupportedChainIdError, useWeb3React } from '@web3-react/core'
import { WalletConnectConnector } from '@web3-react/walletconnect-connector'
import React, { useEffect, useState } from 'react'
import { isMobile } from 'react-device-detect'
import ReactGA from 'react-ga'
import { Modal, Box, Backdrop, Fade } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import MetamaskIcon from 'assets/images/metamask.png'
import { ReactComponent as Close } from 'assets/images/x.svg'
import { fortmatic, injected, portis, safeApp } from 'connectors'
import { OVERLAY_READY } from 'connectors/Fortmatic'
import { SUPPORTED_WALLETS } from 'constants/index'
import usePrevious from 'hooks/usePrevious'
import { ApplicationModal } from 'state/application/actions'
import { useModalOpen, useWalletModalToggle } from 'state/application/hooks'
import { AccountDetails } from 'components'

import Option from './Option'
import PendingView from './PendingView'

const useStyles = makeStyles(({ palette }) => ({
  closeIcon: {
    position: 'absolute',
    right: '1rem',
    top: 14,
    '& svg': {
      stroke: palette.primary.dark,
    },
    '&:hover': {
      cursor: 'pointer',
      opacity: 0.6,
    }
  },
  wrapper: {
    margin: 0,
    padding: 0,
    maxWidth: 500,
    width: '100%',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)'
  },
  headerRow: {
    display: 'flex',
    padding: '1rem',
    fontWeight: 500,
    background: palette.background.paper,
    color: palette.primary.dark,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  contentWrapper: {
    backgroundColor: palette.text.hint,
    padding: '2rem',
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20
  },
  upperSection: {
    position: 'relative',
    '& h5': {
      margin: 0,
      marginBottom: '0.5rem',
      fontSize: '1rem',
      fontWeight: 400,
    },
    '& h5:last-child': {
      marginBottom: 0
    },
    '& h4': {
      marginTop: 0,
      fontWeight: 500
    },
  },
  blurb: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: '2rem',
    color: 'black',
    '& a': {
      color: palette.primary.main,
      textDecoration: 'none'
    }
  },
  optionGrid: {
    display: 'grid',
    gridGap: 10,
  },
  hoverText: {
    '&:hover': {
      cursor: 'pointer'
    }
  }
}));

const WALLET_VIEWS = {
  OPTIONS: 'options',
  OPTIONS_SECONDARY: 'options_secondary',
  ACCOUNT: 'account',
  PENDING: 'pending'
}

interface WalletModalProps {
  pendingTransactions: string[] // hashes of pending
  confirmedTransactions: string[] // hashes of confirmed
  ENSName?: string
}

const WalletModal: React.FC<WalletModalProps> = ({
  pendingTransactions,
  confirmedTransactions,
  ENSName
}) => {
  const classes = useStyles();
  // important that these are destructed from the account-specific web3-react context
  const { active, account, connector, activate, error } = useWeb3React()

  const [walletView, setWalletView] = useState(WALLET_VIEWS.ACCOUNT)

  const [pendingWallet, setPendingWallet] = useState<AbstractConnector | undefined>()

  const [pendingError, setPendingError] = useState<boolean>()

  const walletModalOpen = useModalOpen(ApplicationModal.WALLET)
  const toggleWalletModal = useWalletModalToggle()

  const previousAccount = usePrevious(account)

  // close on connection, when logged out before
  useEffect(() => {
    if (account && !previousAccount && walletModalOpen) {
      toggleWalletModal()
    }
  }, [account, previousAccount, toggleWalletModal, walletModalOpen])

  // always reset to account view
  useEffect(() => {
    if (walletModalOpen) {
      setPendingError(false)
      setWalletView(WALLET_VIEWS.ACCOUNT)
    }
  }, [walletModalOpen])

  // close modal when a connection is successful
  const activePrevious = usePrevious(active)
  const connectorPrevious = usePrevious(connector)
  useEffect(() => {
    if (walletModalOpen && ((active && !activePrevious) || (connector && connector !== connectorPrevious && !error))) {
      setWalletView(WALLET_VIEWS.ACCOUNT)
    }
  }, [setWalletView, active, error, connector, walletModalOpen, activePrevious, connectorPrevious])

  const tryActivation = async (connector: AbstractConnector | undefined) => {
    let name = ''
    Object.keys(SUPPORTED_WALLETS).map(key => {
      if (connector === SUPPORTED_WALLETS[key].connector) {
        return (name = SUPPORTED_WALLETS[key].name)
      }
      return true
    })
    // log selected wallet
    ReactGA.event({
      category: 'Wallet',
      action: 'Change Wallet',
      label: name
    })
    setPendingWallet(connector) // set wallet for pending view
    setWalletView(WALLET_VIEWS.PENDING)

    // if the connector is walletconnect and the user has already tried to connect, manually reset the connector
    if (connector instanceof WalletConnectConnector && connector.walletConnectProvider?.wc?.uri) {
      connector.walletConnectProvider = undefined
    }

    connector &&
      activate(connector, undefined, true).catch(error => {
        if (error instanceof UnsupportedChainIdError) {
          activate(connector) // a little janky...can't use setError because the connector isn't set
        } else {
          setPendingError(true)
        }
      })
  }

  // close wallet modal if fortmatic modal is active
  useEffect(() => {
    fortmatic.on(OVERLAY_READY, () => {
      toggleWalletModal()
    })
  }, [toggleWalletModal])

  // get wallets user can switch too, depending on device/browser
  function getOptions() {
    const { ethereum, web3 } = (window as any);
    const isMetamask = ethereum && ethereum.isMetaMask;
    return Object.keys(SUPPORTED_WALLETS).map(key => {
      const option = SUPPORTED_WALLETS[key]
      //disable safe app by in the list
      if(option.connector === safeApp) {
        return null;
      }
      // check for mobile options
      if (isMobile) {
        //disable portis on mobile for now
        if (option.connector === portis) {
          return null
        }

        if (!web3 && !ethereum && option.mobile) {
          return (
            <Option
              onClick={() => {
                option.connector !== connector && !option.href && tryActivation(option.connector)
              }}
              id={`connect-${key}`}
              key={key}
              active={option.connector && option.connector === connector}
              color={option.color}
              link={option.href}
              header={option.name}
              subheader={null}
              icon={option.iconName}
            />
          )
        }
        return null
      }

      // overwrite injected when needed
      if (option.connector === injected) {
        // don't show injected if there's no injected provider
        if (!(web3 || ethereum)) {
          if (option.name === 'MetaMask') {
            return (
              <Option
                id={`connect-${key}`}
                key={key}
                color={'#E8831D'}
                header={'Install Metamask'}
                subheader={null}
                link={'https://metamask.io/'}
                icon={MetamaskIcon}
              />
            )
          } else {
            return null; //dont want to return install twice
          }
        }
        // don't return metamask if injected provider isn't metamask
        else if (option.name === 'MetaMask' && !isMetamask) {
          return null;
        }
        // likewise for generic
        else if (option.name === 'Injected' && isMetamask) {
          return null;
        }
      }

      // return rest of options
      return (
        !isMobile &&
        !option.mobileOnly && (
          <Option
            id={`connect-${key}`}
            onClick={() => {
              option.connector === connector
                ? setWalletView(WALLET_VIEWS.ACCOUNT)
                : !option.href && tryActivation(option.connector)
            }}
            key={key}
            active={option.connector === connector}
            color={option.color}
            link={option.href}
            header={option.name}
            subheader={null} //use option.descriptio to bring back multi-line
            icon={option.iconName}
          />
        )
      )
    })
  }

  function getModalContent() {
    if (error) {
      return (
        <Box className={classes.upperSection}>
          <Box className={classes.closeIcon} onClick={toggleWalletModal}>
            <Close />
          </Box>
          <Box className={classes.headerRow}>{error instanceof UnsupportedChainIdError ? 'Wrong Network' : 'Error connecting'}</Box>
          <Box className={classes.contentWrapper}>
            {error instanceof UnsupportedChainIdError ? (
              <h5>Please connect to the appropriate Matic network.</h5>
            ) : (
              'Error connecting. Try refreshing the page.'
            )}
          </Box>
        </Box>
      )
    }
    if (account && walletView === WALLET_VIEWS.ACCOUNT) {
      return (
        <AccountDetails
          toggleWalletModal={toggleWalletModal}
          pendingTransactions={pendingTransactions}
          confirmedTransactions={confirmedTransactions}
          ENSName={ENSName}
          openOptions={() => setWalletView(WALLET_VIEWS.OPTIONS)}
        />
      )
    }
    return (
      <Box className={classes.upperSection}>
        <Box className={classes.closeIcon} onClick={toggleWalletModal}>
          <Close />
        </Box>
        {walletView !== WALLET_VIEWS.ACCOUNT ? (
          <Box className={classes.headerRow}>
            <Box className={classes.hoverText}
              onClick={() => {
                setPendingError(false)
                setWalletView(WALLET_VIEWS.ACCOUNT)
              }}
            >
              Back
            </Box>
          </Box>
        ) : (
          <Box className={classes.headerRow}>
            <Box className={classes.hoverText}>Connect to a wallet</Box>
          </Box>
        )}
        <Box className={classes.contentWrapper}>
          {walletView === WALLET_VIEWS.PENDING ? (
            <PendingView
              connector={pendingWallet}
              error={pendingError}
              setPendingError={setPendingError}
              tryActivation={tryActivation}
            />
          ) : (
            <Box className={classes.optionGrid}>{getOptions()}</Box>
          )}
          {walletView !== WALLET_VIEWS.PENDING && (
            <Box className={classes.blurb}>
              <span>New to Matic? &nbsp;</span>{' '}
              <a href="https://docs.matic.network/docs/develop/wallets/getting-started" target='_blank' rel="noreferrer">Learn more about wallets</a>
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  return (
    <Modal open={walletModalOpen} onClose={toggleWalletModal} BackdropComponent={Backdrop} BackdropProps={{ timeout: 500 }}>
      <Fade in={walletModalOpen}>
        <Box className={classes.wrapper}>{getModalContent()}</Box>
      </Fade>
    </Modal>
  )
}

export default WalletModal;

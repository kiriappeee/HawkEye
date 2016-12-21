import InstanceCache from 'Core/InstanceCache';
import OAuthBrowserWindow from 'Electron/OAuthBrowserWindow';

import { push } from 'react-router-redux';

import {
  createErrorAppAlert,
  createSuccessAppAlert
} from 'Helpers/Models/AppAlert';
import { getState } from 'Helpers/State/Store';
import { formatDateAsUTC } from 'Helpers/Lang/Date';
import { getAccount } from 'Helpers/Models/Accounts';
import { makeGitHubUser } from 'Helpers/Models/GitHubUser';
import { getCurrentPollPeriod } from 'Helpers/Models/Settings';
import { configurePollingScheduler } from 'Helpers/System/Scheduler';

import {
  addAccount,
  removeAccount as removeStoreAccount
} from 'Actions/Accounts';
import {
  pollBeforeNotifications,
  removeAccountsNotifications,
} from 'Actions/Notifications';
import { pushAppAlert } from 'Actions/AppAlerts';
import { setCurrentAccountId } from 'Actions/App';
import { setIsAuthenticating } from 'Actions/Authentication';

/**
 */
export function handleAddAccountClick()
{
  let ghAuthService = InstanceCache.getInstance<IGitHubAuthenticationService>
                                                ('IGitHubAuthenticationService');

  /*
   * @todo: Clean this mess up. NEST ALL THE THINGS.
   */
  return dispatch =>
  {
    dispatch(setIsAuthenticating(true));

    /*
     * Generate the OAuth Authentication URL
     */
    ghAuthService
      .generateOAuthUrl()
      .then(url =>
      {
        /*
         * Create the browser window, handle the issues.
         */
        new OAuthBrowserWindow(url)
              .setOnCloseHandler(() => dispatch(setIsAuthenticating(false)))
              .setOnReceivedErrorHandler(() => dispatch(handleAddAccountError()))
              .setOnReceivedCodeHandler(authCode =>
              {
                /*
                 * We have a code, so grab the token
                 */
                ghAuthService
                  .authenticateAccessToken(authCode)
                  .then(authToken =>
                  {
                    /*
                     * Grab the user, so we can store that account
                     */
                    ghAuthService
                      .getAuthenticatedUser(authToken)
                      .then(user =>
                      {
                        /*
                         * Attempt to create the IGitHubUser model.
                         */
                        let gitHubUser = makeGitHubUser(user);
                        if (gitHubUser === null) {
                          dispatch(handleAddAccountError());
                          return;
                        }

                        /*
                         * Okay great. We have the user. So lets store it.
                         * Then let the user know its all going well.
                         */
                        dispatch(setIsAuthenticating(false));
                        dispatch(addAccount(authToken, gitHubUser));
                        dispatch(pushAppAlert(createSuccessAppAlert(
                          'Added @' + gitHubUser.username + ' Account'
                        )));

                        /*
                         * Backport and fill in notifications up until right now.
                         */
                        dispatch(pollBeforeNotifications(gitHubUser.id.toString(),
                                                         authToken,
                                                         formatDateAsUTC(),
                                                         false));

                        /*
                         * If theres no accounts set so far, then set the
                         * current account ID.
                         */
                        if (getState<IState>().app.currentAccountId === null) {
                          dispatch(setCurrentAccountId(gitHubUser.id));
                        }
                      }, err => dispatch(handleAddAccountError()))
                  }, err => dispatch(handleAddAccountError()));
              });
      });
  };
};

/**
 */
function handleAddAccountError()
{
  return dispatch =>
  {
    dispatch(setIsAuthenticating(false));
    dispatch(pushAppAlert(createErrorAppAlert(
      'Issue adding account. Try again?'
    )));
  };
};

/**
 * @param  {string} accoundId
 * @param  {boolean=true} redirect
 */
export function removeAccount(accoundId: string, redirect: boolean = true)
{
  return dispatch =>
  {
    let account = getAccount(accoundId);
    if (!account) {
      return;
    }

    /*
     * Remove the account from state,
     * and remove it's notifications.
     */
    dispatch(removeStoreAccount(accoundId));
    dispatch(removeAccountsNotifications(accoundId));

    /*
     * Account has been removed. So reconfigure polling to
     * not include it!
     */
    configurePollingScheduler(getCurrentPollPeriod());

    /*
     * Redirect if needs be, to settings.
     * @todo: Change this param to a string.
     */
    if (redirect) {
      dispatch(push('/settings'));
    }

    /*
     * Show a notification
     */
    dispatch(pushAppAlert(createSuccessAppAlert(
      'Removed @' + account.gitHubUser.username
    )));
  };
};
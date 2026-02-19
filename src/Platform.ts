import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import axios from 'axios';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import PowerConsumption from './Accessories/PowerConsumption';
import PowerReturn from './Accessories/PowerReturn';

/**
 * HomewizardPowerConsumption Platform
 */
export class HomewizardPowerConsumption implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // Käytetään tallentamaan löydetyt lisälaitteet
  public readonly accessories: PlatformAccessory[] = [];
  
  private heartBeatInterval: number;
  private devices: any[] = []; // Tähän tallennetaan käynnistetyt lisälaiteoliot
  private deviceData: any;
  private apiPath = '/api/v1'; // Oletus, päivitetään initialise-vaiheessa

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.heartBeatInterval = (config.pollInterval || 10) * 1000;

    this.log.debug('Platform alustettu, odotetaan Homebridgen käynnistystä...');

    this.api.on('didFinishLaunching', () => {
      this.initialise();
    });
  }

  /**
   * Homebridge kutsuu tätä, kun se palauttaa välimuistista vanhan lisälaitteen.
   */
  public configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Ladataan lisälaite välimuistista:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private validateConfig(): boolean {
    return !!this.config.ip;
  }

  /**
   * Tarkistetaan laitteen IP ja selvitetään tukeeko se API v2:sta.
   */
  private async discoverDevice(): Promise<boolean> {
    const ip = this.config.ip;
    try {
      // Kokeillaan ensin v2:sta
      this.log.debug(`Yritetään yhdistää: ${ip} (API v2)...`);
      const response = await axios.get(`http://${ip}/api/v2`, { timeout: 3000 });
      this.deviceData = response.data;
      this.apiPath = '/api/v2';
      this.log.info(`HomeWizard laite tunnistettu! Käytetään API v2 -rajapintaa.`);
      return true;
    } catch (error) {
      try {
        // Jos v2 epäonnistuu, kokeillaan v1:stä
        this.log.debug(`v2 ei vastannut, yritetään API v1...`);
        const response = await axios.get(`http://${ip}/api/v1`, { timeout: 3000 });
        this.deviceData = response.data;
        this.apiPath = '/api/v1';
        this.log.info(`HomeWizard laite tunnistettu! Käytetään API v1 -rajapintaa.`);
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  private async initialise() {
    if (!this.validateConfig()) {
      this.log.error('Konfiguraatiovirhe: Anna HomeWizard-laitteen IP-osoite asetuksissa.');
      return;
    }

    if (!await this.discoverDevice()) {
      this.log.error(`Yhteys osoitteeseen ${this.config.ip} epäonnistui. Tarkista IP ja API-asetukset.`);
      return;
    }

    this.setupAccessories();

    // Ensimmäinen haku heti
    await this.heartBeat();

    // Säännöllinen päivitys
    setInterval(() => {
      this.heartBeat();
    }, this.heartBeatInterval);
  }

  private setupAccessories() {
    // 1. Power Consumption (Kulutus)
    const consumptionName = 'Power Consumption';
    const consumptionUuid = this.api.hap.uuid.generate('homewizard-power-consumption');
    const existingConsumption = this.accessories.find(acc => acc.UUID === consumptionUuid);

    if (this.config.hidePowerConsumptionDevice !== true) {
      if (existingConsumption) {
        this.log.debug('Palautetaan olemassa oleva kulutus-sensori');
        this.devices.push(new PowerConsumption(this.config, this.log, this.api, existingConsumption, this.deviceData));
      } else {
        this.log.info('Lisätään uusi kulutus-sensori');
        const accessory = new this.api.platformAccessory(consumptionName, consumptionUuid);
        this.devices.push(new PowerConsumption(this.config, this.log, this.api, accessory, this.deviceData));
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // 2. Power Return (Tuotto/Palautus)
    const returnName = 'Power Return';
    const returnUuid = this.api.hap.uuid.generate('homewizard-power-return');
    const existingReturn = this.accessories.find(acc => acc.UUID === returnUuid);

    if (this.config.hidePowerReturnDevice !== true) {
      if (existingReturn) {
        this.log.debug('Palautetaan olemassa oleva tuotto-sensori');
        this.devices.push(new PowerReturn(this.config, this.log, this.api, existingReturn, this.deviceData));
      } else {
        this.log.info('Lisätään uusi tuotto-sensori');
        const accessory = new this.api.platformAccessory(returnName, returnUuid);
        this.devices.push(new PowerReturn(this.config, this.log, this.api, accessory, this.deviceData));
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  /**
   * Hakee datan laitteelta ja lähettää sen sensoreille
   */
  private async heartBeat() {
    const url = `http://${this.config.ip}${this.apiPath}/data`;
    try {
      const { data } = await axios.get(url, { timeout: 5000 });
      
      // Lähetetään data kaikille rekisteröidyille laitteille
      this.devices.forEach(device => {
        if (typeof device.beat === 'function') {
          device.beat(data);
        }
      });

      this.log.debug(`Datan haku onnistui (${this.apiPath}): ${data.active_power_w} W`);
    } catch (error: any) {
      this.log.error(`Virhe haettaessa dataa (${url}): ${error.message}`);
    }
  }
}
